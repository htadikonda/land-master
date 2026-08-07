import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePlace, parseAddressComponents, formatCoords } from '../src/lib/placeParse.js';
import { classifyZone, zoneLabel, floodFeatureStyle } from '../src/lib/floodStyle.js';
import { esriToGeoJson, isClockwise } from '../src/lib/esri.js';
import { floodPoint } from '../src/hooks/useLookup.js';

test('parses Places API (New) address components', () => {
  const parsed = parseAddressComponents([
    { longText: '1234', shortText: '1234', types: ['street_number'] },
    { longText: 'Magazine Street', shortText: 'Magazine St', types: ['route'] },
    { longText: 'New Orleans', shortText: 'New Orleans', types: ['locality'] },
    { longText: 'Louisiana', shortText: 'LA', types: ['administrative_area_level_1'] },
    { longText: '70130', shortText: '70130', types: ['postal_code'] },
  ]);

  assert.deepEqual(parsed, {
    street: '1234 Magazine Street',
    city: 'New Orleans',
    state: 'LA',
    zip: '70130',
  });
});

test('parses legacy PlaceResult address components identically', () => {
  const parsed = parseAddressComponents([
    { long_name: '1234', short_name: '1234', types: ['street_number'] },
    { long_name: 'Magazine Street', short_name: 'Magazine St', types: ['route'] },
    { long_name: 'New Orleans', short_name: 'New Orleans', types: ['locality'] },
    { long_name: 'Louisiana', short_name: 'LA', types: ['administrative_area_level_1'] },
    { long_name: '70130', short_name: '70130', types: ['postal_code'] },
  ]);

  assert.equal(parsed.street, '1234 Magazine Street');
  assert.equal(parsed.state, 'LA', 'the 2-letter short form is what Census wants');
});

test('normalizePlace reads LatLng whether accessors are methods or numbers', () => {
  const fromNewApi = normalizePlace({
    formattedAddress: '1234 Magazine St, New Orleans, LA 70130, USA',
    location: { lat: () => 29.9511, lng: () => -90.0715 },
    addressComponents: [{ longText: 'LA', shortText: 'LA', types: ['administrative_area_level_1'] }],
  });
  assert.equal(fromNewApi.lat, 29.9511);
  assert.equal(fromNewApi.lng, -90.0715);

  const fromLegacy = normalizePlace({
    formatted_address: 'x',
    geometry: { location: { lat: 41.8781, lng: -87.6298 } },
    address_components: [],
  });
  assert.equal(fromLegacy.lat, 41.8781);
  assert.equal(fromLegacy.lng, -87.6298);

  assert.equal(normalizePlace({ formattedAddress: 'no geometry' }), null);
});

test('formatCoords is lat,lng in that order', () => {
  assert.equal(formatCoords(29.9511, -90.0715, 4), '29.9511, -90.0715');
  assert.equal(formatCoords(null, 2), '—');
});

test('flood zones classify on FLD_ZONE plus ZONE_SUBTY', () => {
  assert.equal(classifyZone({ FLD_ZONE: 'AE' }), 'HIGH_RIVERINE');
  assert.equal(classifyZone({ FLD_ZONE: 'A' }), 'HIGH_RIVERINE');
  assert.equal(classifyZone({ FLD_ZONE: 'AO' }), 'HIGH_RIVERINE');
  assert.equal(classifyZone({ FLD_ZONE: 'VE' }), 'HIGH_COASTAL');
  assert.equal(classifyZone({ FLD_ZONE: 'V' }), 'HIGH_COASTAL');
  assert.equal(classifyZone({ FLD_ZONE: 'D' }), 'UNDETERMINED');
  assert.equal(classifyZone({ FLD_ZONE: 'X' }), 'MINIMAL');
  assert.equal(
    classifyZone({ FLD_ZONE: 'X', ZONE_SUBTY: '0.2 PCT ANNUAL CHANCE FLOOD HAZARD' }),
    'MODERATE',
  );
  // The floodway subtype outranks the zone letter.
  assert.equal(classifyZone({ FLD_ZONE: 'AE', ZONE_SUBTY: 'FLOODWAY' }), 'FLOODWAY');
});

test('coastal and riverine zones get visibly different colors', () => {
  const coastal = floodFeatureStyle({ FLD_ZONE: 'VE' });
  const riverine = floodFeatureStyle({ FLD_ZONE: 'AE' });
  const minimal = floodFeatureStyle({ FLD_ZONE: 'X' });
  assert.notEqual(coastal.fillColor, riverine.fillColor);
  assert.notEqual(minimal.fillColor, riverine.fillColor);
  assert.ok(minimal.fillOpacity < riverine.fillOpacity, 'minimal risk reads as muted');
});

test('zoneLabel combines zone and subtype', () => {
  assert.equal(zoneLabel({ FLD_ZONE: 'AE', ZONE_SUBTY: 'FLOODWAY' }), 'AE — Floodway');
  assert.equal(zoneLabel({ FLD_ZONE: 'X' }), 'X');
  assert.equal(zoneLabel(null), null);
});

test('esri rings convert to GeoJSON with holes nested in their parent polygon', () => {
  const outer = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
    [0, 0],
  ];
  const hole = [
    [2, 2],
    [4, 2],
    [4, 4],
    [2, 4],
    [2, 2],
  ];
  assert.equal(isClockwise(outer), true);
  assert.equal(isClockwise(hole), false);

  const collection = esriToGeoJson({
    features: [{ attributes: { FLD_ZONE: 'AE' }, geometry: { rings: [outer, hole] } }],
  });

  assert.equal(collection.type, 'FeatureCollection');
  assert.equal(collection.features[0].geometry.type, 'Polygon');
  assert.equal(collection.features[0].geometry.coordinates.length, 2, 'outer ring + one hole');
  assert.equal(collection.features[0].properties.FLD_ZONE, 'AE');
});

test('floodPoint falls back to the Census match when Places gave no geometry', () => {
  assert.deepEqual(floodPoint({ lat: 1, lng: 2 }, { status: 'ok', coordinates: { lat: 3, lon: 4 } }), {
    lat: 1,
    lng: 2,
  });
  assert.deepEqual(
    floodPoint({ lat: null, lng: null }, { status: 'ok', coordinates: { lat: 3, lon: 4 } }),
    { lat: 3, lng: 4 },
  );
  assert.equal(floodPoint(null, { status: 'idle' }), null);
});
