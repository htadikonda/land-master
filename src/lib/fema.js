/**
 * FEMA National Flood Hazard Layer (NFHL) — flood zone at a point.
 *
 * Layer 28 of the public NFHL MapServer is "Flood Hazard Zones". Queries are
 * issued as GET so the browser sends a simple request with no preflight, and
 * ArcGIS's permissive CORS headers do the rest — no proxy involved.
 */
import { fetchJsonWithJsonpFallback } from './jsonp.js';
import { esriToGeoJson } from './esri.js';

const NFHL_SERVER = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer';

/** "Flood Hazard Zones". */
export const FLOOD_ZONE_LAYER_ID = 28;

export const FLOOD_QUERY_URL = `${NFHL_SERVER}/${FLOOD_ZONE_LAYER_ID}/query`;
export const NFHL_EXPORT_URL = `${NFHL_SERVER}/export`;

const FLOOD_FIELDS = 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DEPTH,V_DATUM,LEN_UNIT,DFIRM_ID,FLD_AR_ID';

/** ArcGIS writes "no applicable value" as -9999, not null. */
const NULL_SENTINEL = -9999;

/**
 * Esri point geometry for a lat/lng.
 *
 * x is LONGITUDE and y is LATITUDE. Swapping them is the classic way to get a
 * silently empty result set (or a hit in the wrong hemisphere), so the mapping
 * lives in exactly this one function.
 */
export function pointGeometry(lat, lng) {
  return JSON.stringify({ x: Number(lng), y: Number(lat), spatialReference: { wkid: 4326 } });
}

/**
 * Query params for a point-in-polygon lookup.
 * `returnGeometry: false` for the attribute readout, `true` for the overlay.
 */
export function floodQueryParams(lat, lng, { returnGeometry = false } = {}) {
  return {
    geometry: pointGeometry(lat, lng),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: returnGeometry ? '*' : FLOOD_FIELDS,
    returnGeometry: returnGeometry ? 'true' : 'false',
    f: returnGeometry ? 'geojson' : 'json',
  };
}

function cleanNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num === NULL_SENTINEL) return null;
  return num;
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === String(NULL_SENTINEL)) return null;
  return text;
}

/**
 * Normalize the attribute payload.
 *
 * No features is a legitimate answer, not an error: the point simply sits
 * outside any mapped Special Flood Hazard Area (effectively Zone X or an
 * unmapped community).
 */
export function parseFloodAttributes(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  if (features.length === 0) {
    return { mapped: false, inSfha: false, attributes: null };
  }

  // A point can fall in overlapping polygons (e.g. a floodway inside an AE
  // area). Prefer an SFHA record so the readout reflects the governing zone.
  const rows = features.map((f) => f.attributes || f.properties || {});
  const attrs = rows.find((row) => String(row.SFHA_TF).toUpperCase() === 'T') || rows[0];

  return {
    mapped: true,
    inSfha: String(attrs.SFHA_TF).toUpperCase() === 'T',
    attributes: {
      FLD_ZONE: cleanText(attrs.FLD_ZONE),
      ZONE_SUBTY: cleanText(attrs.ZONE_SUBTY),
      SFHA_TF: cleanText(attrs.SFHA_TF),
      STATIC_BFE: cleanNumber(attrs.STATIC_BFE),
      DEPTH: cleanNumber(attrs.DEPTH),
      V_DATUM: cleanText(attrs.V_DATUM),
      LEN_UNIT: cleanText(attrs.LEN_UNIT),
      DFIRM_ID: cleanText(attrs.DFIRM_ID),
    },
    otherZoneCount: Math.max(0, rows.length - 1),
  };
}

/** Flood-zone attributes at a point. */
export async function fetchFloodAttributes(lat, lng, options = {}) {
  const payload = await fetchJsonWithJsonpFallback(
    FLOOD_QUERY_URL,
    floodQueryParams(lat, lng, { returnGeometry: false }),
    options,
  );
  return parseFloodAttributes(payload);
}

/** Flood-zone polygon at a point, as GeoJSON. Empty collection when unmapped. */
export async function fetchFloodGeoJson(lat, lng, options = {}) {
  const payload = await fetchJsonWithJsonpFallback(
    FLOOD_QUERY_URL,
    floodQueryParams(lat, lng, { returnGeometry: true }),
    options,
  );
  const collection = payload?.__viaJsonpFallback ? esriToGeoJson(payload) : payload;
  if (!collection || !Array.isArray(collection.features)) {
    return { type: 'FeatureCollection', features: [] };
  }
  return collection;
}

const WEB_MERCATOR_HALF_CIRCUMFERENCE = 20037508.342789244;

/**
 * Tile URL for the optional full-map FEMA overlay.
 *
 * `google.maps.ImageMapType` asks for 256px tiles by z/x/y; the NFHL export
 * endpoint wants a Web Mercator bbox, so convert. Image responses are not
 * CORS-restricted, which is why this overlay works on a static origin even
 * though it is cross-origin.
 *
 * Returns null for out-of-range tiles so the map skips the request.
 */
export function femaTileUrl(coord, zoom, { layerId = FLOOD_ZONE_LAYER_ID, tileSize = 256 } = {}) {
  const tiles = 1 << zoom;
  if (!coord || coord.y < 0 || coord.y >= tiles) return null;

  // Horizontal wrap: normalize x so panning past the antimeridian still works.
  const x = ((coord.x % tiles) + tiles) % tiles;
  const span = (WEB_MERCATOR_HALF_CIRCUMFERENCE * 2) / tiles;

  const minX = -WEB_MERCATOR_HALF_CIRCUMFERENCE + x * span;
  const maxX = minX + span;
  const maxY = WEB_MERCATOR_HALF_CIRCUMFERENCE - coord.y * span;
  const minY = maxY - span;

  const params = new URLSearchParams({
    bbox: `${minX},${minY},${maxX},${maxY}`,
    bboxSR: '3857',
    imageSR: '3857',
    size: `${tileSize},${tileSize}`,
    dpi: '96',
    format: 'png32',
    transparent: 'true',
    layers: `show:${layerId}`,
    f: 'image',
  });

  return `${NFHL_EXPORT_URL}?${params.toString()}`;
}
