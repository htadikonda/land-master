/**
 * TIGERweb — census tract boundary polygon by GEOID.
 *
 * ArcGIS sends `Access-Control-Allow-Origin: *`, so this is a plain CORS
 * `fetch`, with the shared JSONP fallback wired in case that ever changes.
 */
import { fetchJson, fetchJsonWithJsonpFallback } from './jsonp.js';
import { esriToGeoJson } from './esri.js';

const MAP_SERVER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer';

/** Used if layer discovery fails; layer 0 of Tracts_Blocks is the tract layer. */
const DEFAULT_TRACT_LAYER_ID = 0;

const TRACT_FIELDS = 'GEOID,NAME,BASENAME,STATE,COUNTY,TRACT,AREALAND,AREAWATER';

let tractLayerIdPromise = null;

/**
 * Resolve the tract layer id from the service metadata rather than hardcoding
 * it: the Tracts_Blocks service is re-published each vintage and layer ids have
 * moved before. Cached for the page's lifetime, and never fatal — on any
 * failure we fall back to the well-known default.
 */
export function resolveTractLayerId(options = {}) {
  if (!tractLayerIdPromise) {
    tractLayerIdPromise = fetchJson(MAP_SERVER, { f: 'json' }, options)
      .then((meta) => {
        const layers = Array.isArray(meta?.layers) ? meta.layers : [];
        const match = layers.find((layer) => /tract/i.test(layer?.name || ''));
        return match ? match.id : DEFAULT_TRACT_LAYER_ID;
      })
      .catch(() => DEFAULT_TRACT_LAYER_ID);
  }
  return tractLayerIdPromise;
}

/** Reset the cached layer id. Used by tests. */
export function resetTractLayerCache() {
  tractLayerIdPromise = null;
}

export function tractQueryParams(geoid) {
  return {
    where: `GEOID='${String(geoid).replace(/'/g, "''")}'`,
    outFields: TRACT_FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  };
}

export function tractQueryUrl(layerId) {
  return `${MAP_SERVER}/${layerId}/query`;
}

/**
 * Fetch the tract polygon for a GEOID as a GeoJSON FeatureCollection, ready to
 * hand to `google.maps.Data#addGeoJson`.
 */
export async function fetchTractGeoJson(geoid, options = {}) {
  if (!geoid) throw new Error('A tract GEOID is required.');

  const layerId = await resolveTractLayerId(options);
  const payload = await fetchJsonWithJsonpFallback(
    tractQueryUrl(layerId),
    tractQueryParams(geoid),
    options,
  );

  // The JSONP fallback downgrades `f=geojson` to Esri JSON; normalize both.
  const collection = payload?.__viaJsonpFallback ? esriToGeoJson(payload) : payload;

  if (!collection || !Array.isArray(collection.features) || collection.features.length === 0) {
    throw new Error(`No tract boundary found for GEOID ${geoid}.`);
  }
  return collection;
}
