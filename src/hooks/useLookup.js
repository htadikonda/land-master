import { useCallback, useEffect, useRef, useState } from 'react';
import { geocodeAddress } from '../lib/census.js';
import { fetchTractGeoJson } from '../lib/tigerweb.js';
import { fetchFloodAttributes, fetchFloodGeoJson } from '../lib/fema.js';

/**
 * Drives the three data sources for a selected address.
 *
 * Each source owns its own status so a failure stays local: a Census outage
 * still leaves the flood readout populated, and vice versa. Census and FEMA
 * start in parallel; the tract boundary is the only genuinely dependent call,
 * since it needs the GEOID that Census returns.
 */

const IDLE = { status: 'idle' };
const LOADING = { status: 'loading' };

function errorState(error) {
  return { status: 'error', error: error?.message || 'Request failed.' };
}

export function useLookup() {
  const [place, setPlace] = useState(null);
  const [census, setCensus] = useState(IDLE);
  const [tract, setTract] = useState(IDLE);
  const [flood, setFlood] = useState(IDLE);

  // Every lookup gets an id; stale responses from a superseded lookup are
  // dropped rather than overwriting fresher state.
  const runIdRef = useRef(0);
  const abortRef = useRef(null);
  const placeRef = useRef(null);

  useEffect(
    () => () => {
      runIdRef.current += 1;
      abortRef.current?.abort();
    },
    [],
  );

  const isStale = useCallback((runId) => runId !== runIdRef.current, []);

  const runTract = useCallback(
    async (geoid, runId, signal) => {
      if (!geoid) {
        setTract({ status: 'empty' });
        return;
      }
      setTract(LOADING);
      try {
        const geojson = await fetchTractGeoJson(geoid, { signal });
        if (isStale(runId)) return;
        setTract({ status: 'ok', geojson });
      } catch (error) {
        if (isStale(runId) || error?.code === 'ABORTED') return;
        setTract(errorState(error));
      }
    },
    [isStale],
  );

  const runFlood = useCallback(
    async (lat, lng, runId, signal) => {
      setFlood(LOADING);
      try {
        // Attributes and geometry are separate requests so the readout can
        // appear even if the (much larger) polygon request fails.
        const attributes = await fetchFloodAttributes(lat, lng, { signal });
        if (isStale(runId)) return;
        setFlood({ status: 'ok', ...attributes, geojson: null });

        if (!attributes.mapped) return;

        const geojson = await fetchFloodGeoJson(lat, lng, { signal });
        if (isStale(runId)) return;
        setFlood((current) =>
          current.status === 'ok' ? { ...current, geojson } : current,
        );
      } catch (error) {
        if (isStale(runId) || error?.code === 'ABORTED') return;
        setFlood(errorState(error));
      }
    },
    [isStale],
  );

  const runCensus = useCallback(
    async (target, runId, signal) => {
      setCensus(LOADING);
      setTract(IDLE);
      try {
        const result = await geocodeAddress(
          { ...target.components, formattedAddress: target.formattedAddress },
          { signal },
        );
        if (isStale(runId)) return;
        setCensus({ status: 'ok', ...result });

        // Manual-entry fallback: with no Places geometry, the Census match is
        // the only point we have, so FEMA waits for it.
        if (!Number.isFinite(target.lat) && result.coordinates) {
          runFlood(result.coordinates.lat, result.coordinates.lon, runId, signal);
        }

        runTract(result.tract?.geoid, runId, signal);
      } catch (error) {
        if (isStale(runId) || error?.code === 'ABORTED') return;
        if (error?.code === 'NO_MATCH') {
          setCensus({ status: 'nomatch', error: error.message });
        } else {
          setCensus(errorState(error));
        }
        setTract(IDLE);
      }
    },
    [isStale, runFlood, runTract],
  );

  const lookup = useCallback(
    (nextPlace) => {
      if (!nextPlace) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const runId = (runIdRef.current += 1);

      placeRef.current = nextPlace;
      setPlace(nextPlace);
      setCensus(IDLE);
      setTract(IDLE);
      setFlood(IDLE);

      runCensus(nextPlace, runId, controller.signal);
      if (Number.isFinite(nextPlace.lat) && Number.isFinite(nextPlace.lng)) {
        runFlood(nextPlace.lat, nextPlace.lng, runId, controller.signal);
      }
    },
    [runCensus, runFlood],
  );

  const retryCensus = useCallback(() => {
    const target = placeRef.current;
    if (!target) return;
    runCensus(target, runIdRef.current, abortRef.current?.signal);
  }, [runCensus]);

  const retryFlood = useCallback(() => {
    const target = placeRef.current;
    const point = floodPoint(target, census);
    if (!point) return;
    runFlood(point.lat, point.lng, runIdRef.current, abortRef.current?.signal);
  }, [census, runFlood]);

  const retryTract = useCallback(() => {
    const geoid = census.status === 'ok' ? census.tract?.geoid : null;
    if (!geoid) return;
    runTract(geoid, runIdRef.current, abortRef.current?.signal);
  }, [census, runTract]);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    placeRef.current = null;
    setPlace(null);
    setCensus(IDLE);
    setTract(IDLE);
    setFlood(IDLE);
  }, []);

  return { place, census, tract, flood, lookup, reset, retryCensus, retryFlood, retryTract };
}

/** The point FEMA was (or should be) queried at: Places geometry, else the Census match. */
export function floodPoint(place, census) {
  if (place && Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
    return { lat: place.lat, lng: place.lng };
  }
  if (census?.status === 'ok' && census.coordinates) {
    return { lat: census.coordinates.lat, lng: census.coordinates.lon };
  }
  return null;
}
