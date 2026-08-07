/**
 * Esri JSON -> GeoJSON.
 *
 * Only needed on the JSONP fallback path: ArcGIS can wrap `f=json` in a JSONP
 * callback but not `f=geojson`, so if CORS ever breaks we ask for Esri JSON and
 * convert it here into what `google.maps.Data#addGeoJson` expects.
 */

/**
 * Shoelace sign test. Esri draws outer rings clockwise and holes
 * counter-clockwise; GeoJSON instead nests holes inside their parent polygon,
 * so the winding is what tells us where each polygon starts.
 */
export function isClockwise(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum > 0;
}

export function esriRingsToGeometry(rings) {
  if (!Array.isArray(rings) || rings.length === 0) return null;

  const polygons = [];
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 4) continue;
    if (isClockwise(ring) || polygons.length === 0) {
      polygons.push([ring]);
    } else {
      polygons[polygons.length - 1].push(ring);
    }
  }

  if (polygons.length === 0) return null;
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

export function esriGeometryToGeoJson(geometry) {
  if (!geometry) return null;
  if (Array.isArray(geometry.rings)) return esriRingsToGeometry(geometry.rings);
  if (Array.isArray(geometry.paths)) {
    const paths = geometry.paths.filter((p) => Array.isArray(p) && p.length >= 2);
    if (paths.length === 0) return null;
    return paths.length === 1
      ? { type: 'LineString', coordinates: paths[0] }
      : { type: 'MultiLineString', coordinates: paths };
  }
  if (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) {
    return { type: 'Point', coordinates: [geometry.x, geometry.y] };
  }
  return null;
}

/** Convert an Esri `queryResult` payload into a GeoJSON FeatureCollection. */
export function esriToGeoJson(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return {
    type: 'FeatureCollection',
    features: features
      .map((feature) => ({
        type: 'Feature',
        properties: feature.attributes || {},
        geometry: esriGeometryToGeoJson(feature.geometry),
      }))
      .filter((feature) => feature.geometry !== null),
  };
}
