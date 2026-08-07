/**
 * Normalize a Google Places result.
 *
 * Two shapes have to be supported, because which one you get depends on the age
 * of the Google Cloud project:
 *
 *   - Places API (New) `Place`  -> `formattedAddress`, `location`,
 *     `addressComponents` with `longText` / `shortText`.
 *   - Legacy `PlaceResult`      -> `formatted_address`, `geometry.location`,
 *     `address_components` with `long_name` / `short_name`.
 *
 * Everything downstream sees one flat object.
 */

/** Read a LatLng-like value; the accessors are methods on some shapes, plain numbers on others. */
export function readLatLng(value) {
  if (!value) return null;
  const lat = typeof value.lat === 'function' ? value.lat() : value.lat;
  const lng = typeof value.lng === 'function' ? value.lng() : value.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

function normalizeComponents(rawComponents) {
  if (!Array.isArray(rawComponents)) return [];
  return rawComponents.map((component) => ({
    long: component.longText ?? component.long_name ?? '',
    short: component.shortText ?? component.short_name ?? '',
    types: component.types || [],
  }));
}

function pick(components, type, form = 'long') {
  const match = components.find((component) => component.types.includes(type));
  if (!match) return '';
  return (form === 'short' ? match.short : match.long) || '';
}

/**
 * Split address components into the fields the Census structured geocoder
 * wants: street (number + route), city, 2-letter state, ZIP.
 */
export function parseAddressComponents(rawComponents) {
  const components = normalizeComponents(rawComponents);

  const streetNumber = pick(components, 'street_number');
  const route = pick(components, 'route');
  const city =
    pick(components, 'locality') ||
    pick(components, 'postal_town') ||
    pick(components, 'sublocality_level_1') ||
    pick(components, 'sublocality') ||
    pick(components, 'administrative_area_level_3');

  return {
    street: [streetNumber, route].filter(Boolean).join(' '),
    city,
    // Census expects the 2-letter abbreviation, which is the `short` form.
    state: pick(components, 'administrative_area_level_1', 'short'),
    zip: pick(components, 'postal_code'),
  };
}

/** Normalize either Place shape into `{ formattedAddress, lat, lng, components }`. */
export function normalizePlace(place) {
  if (!place) return null;

  const formattedAddress = place.formattedAddress ?? place.formatted_address ?? '';
  const location = readLatLng(place.location ?? place.geometry?.location);
  const components = parseAddressComponents(place.addressComponents ?? place.address_components);

  if (!location) return null;

  return {
    formattedAddress,
    lat: location.lat,
    lng: location.lng,
    components,
  };
}

/** Format coordinates for the readout, e.g. "29.951100, -90.071500". */
export function formatCoords(lat, lng, digits = 6) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '—';
  return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`;
}
