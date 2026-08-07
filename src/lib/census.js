/**
 * US Census Geocoder — address -> coordinates + census tract.
 *
 * The geocoder does not send CORS headers, so this module goes through JSONP
 * (`format=jsonp&callback=`) exclusively. That is the single reason Land Master
 * can be a pure static site: no proxy is needed to reach it.
 */
import { jsonp } from './jsonp.js';

const GEOGRAPHIES_BASE = 'https://geocoding.geo.census.gov/geocoder/geographies';

/** Current address ranges / current geography vintage. */
export const BENCHMARK = 'Public_AR_Current';
export const VINTAGE = 'Current_Current';

/** Key of the tract entry inside `geographies`. */
const TRACT_LAYER = 'Census Tracts';

export class CensusNoMatchError extends Error {
  constructor(message = "We couldn't match that address in the Census geocoder.") {
    super(message);
    this.name = 'CensusNoMatchError';
    this.code = 'NO_MATCH';
  }
}

/**
 * Pick the endpoint + params for an address.
 *
 * The structured `/address` endpoint matches far more reliably than the
 * one-line parser, so it is used whenever we have a street plus either a ZIP or
 * a city/state pair — which Google Places address components almost always give
 * us. Otherwise fall back to `/onelineaddress` with the formatted address.
 */
export function censusRequest(address) {
  const { street, city, state, zip, formattedAddress } = address || {};
  const hasStructured = Boolean(street && (zip || (city && state)));

  if (hasStructured) {
    return {
      url: `${GEOGRAPHIES_BASE}/address`,
      params: {
        street,
        city,
        state,
        zip,
        benchmark: BENCHMARK,
        vintage: VINTAGE,
        format: 'jsonp',
      },
    };
  }

  const oneline = formattedAddress || [street, city, state, zip].filter(Boolean).join(', ');
  return {
    url: `${GEOGRAPHIES_BASE}/onelineaddress`,
    params: {
      address: oneline,
      benchmark: BENCHMARK,
      vintage: VINTAGE,
      format: 'jsonp',
    },
  };
}

/**
 * Normalize a raw geocoder payload.
 *
 * Census returns `coordinates` as `{ x: longitude, y: latitude }` — x is
 * longitude, NOT latitude. Everything downstream consumes `{ lat, lon }` so the
 * axis order is settled exactly once, here.
 */
export function parseCensusResponse(payload) {
  const matches = payload?.result?.addressMatches;
  if (!Array.isArray(matches) || matches.length === 0) throw new CensusNoMatchError();

  const match = matches[0];
  const { x, y } = match.coordinates || {};
  const tractRow = match.geographies?.[TRACT_LAYER]?.[0];

  return {
    matchedAddress: match.matchedAddress || null,
    coordinates:
      Number.isFinite(x) && Number.isFinite(y) ? { lon: Number(x), lat: Number(y) } : null,
    tract: tractRow
      ? {
          geoid: tractRow.GEOID ?? null,
          state: tractRow.STATE ?? null,
          county: tractRow.COUNTY ?? null,
          tract: tractRow.TRACT ?? null,
          name: tractRow.NAME ?? null,
          basename: tractRow.BASENAME ?? null,
        }
      : null,
  };
}

/** Geocode an address and return `{ matchedAddress, coordinates, tract }`. */
export async function geocodeAddress(address, options = {}) {
  const { url, params } = censusRequest(address);
  const payload = await jsonp(url, params, options);
  return parseCensusResponse(payload);
}
