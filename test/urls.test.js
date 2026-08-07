import assert from 'node:assert/strict';
import test from 'node:test';

import { buildUrl } from '../src/lib/jsonp.js';
import { censusRequest, parseCensusResponse, CensusNoMatchError } from '../src/lib/census.js';
import {
  floodQueryParams,
  pointGeometry,
  parseFloodAttributes,
  femaTileUrl,
} from '../src/lib/fema.js';
import { tractQueryParams, tractQueryUrl } from '../src/lib/tigerweb.js';

const NEW_ORLEANS = { lat: 29.9511, lng: -90.0715 };

test('buildUrl percent-encodes values and drops empty params', () => {
  const url = buildUrl('https://example.test/query', {
    where: "GEOID='22071013300'",
    empty: '',
    missing: undefined,
    nulled: null,
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('where'), "GEOID='22071013300'");
  assert.equal(parsed.searchParams.has('empty'), false);
  assert.equal(parsed.searchParams.has('missing'), false);
  assert.equal(parsed.searchParams.has('nulled'), false);
  // The raw query string must not contain a literal quote or space.
  assert.ok(!parsed.search.includes(' '));
});

test('FEMA point geometry maps x to longitude and y to latitude', () => {
  const geometry = JSON.parse(pointGeometry(NEW_ORLEANS.lat, NEW_ORLEANS.lng));
  assert.equal(geometry.x, -90.0715, 'x must be longitude');
  assert.equal(geometry.y, 29.9511, 'y must be latitude');
  assert.equal(geometry.spatialReference.wkid, 4326);
});

test('FEMA query is a simple GET with no preflight-triggering params', () => {
  const attrs = floodQueryParams(NEW_ORLEANS.lat, NEW_ORLEANS.lng);
  assert.equal(attrs.returnGeometry, 'false');
  assert.equal(attrs.f, 'json');
  assert.equal(attrs.geometryType, 'esriGeometryPoint');
  assert.equal(attrs.spatialRel, 'esriSpatialRelIntersects');

  const geom = floodQueryParams(NEW_ORLEANS.lat, NEW_ORLEANS.lng, { returnGeometry: true });
  assert.equal(geom.returnGeometry, 'true');
  assert.equal(geom.f, 'geojson');
  assert.equal(geom.outFields, '*');

  // The whole geometry survives URL encoding intact.
  const url = new URL(buildUrl('https://hazards.fema.gov/x/query', geom));
  assert.deepEqual(JSON.parse(url.searchParams.get('geometry')), {
    x: -90.0715,
    y: 29.9511,
    spatialReference: { wkid: 4326 },
  });
});

test('census request prefers the structured endpoint and always asks for jsonp', () => {
  const structured = censusRequest({
    street: '1234 Magazine St',
    city: 'New Orleans',
    state: 'LA',
    zip: '70130',
  });
  assert.match(structured.url, /geographies\/address$/);
  assert.equal(structured.params.format, 'jsonp');
  assert.equal(structured.params.street, '1234 Magazine St');
  assert.equal(structured.params.benchmark, 'Public_AR_Current');
  assert.equal(structured.params.vintage, 'Current_Current');

  const oneline = censusRequest({ formattedAddress: '1600 Pennsylvania Ave NW, Washington, DC' });
  assert.match(oneline.url, /geographies\/onelineaddress$/);
  assert.equal(oneline.params.format, 'jsonp');
  assert.equal(oneline.params.address, '1600 Pennsylvania Ave NW, Washington, DC');
});

test('census response parsing converts {x,y} to {lon,lat} and lifts the tract', () => {
  const parsed = parseCensusResponse({
    result: {
      addressMatches: [
        {
          matchedAddress: '1234 MAGAZINE ST, NEW ORLEANS, LA, 70130',
          coordinates: { x: -90.0715, y: 29.9511 },
          geographies: {
            'Census Tracts': [
              {
                GEOID: '22071013300',
                STATE: '22',
                COUNTY: '071',
                TRACT: '013300',
                NAME: 'Census Tract 133',
                BASENAME: '133',
              },
            ],
          },
        },
      ],
    },
  });

  assert.equal(parsed.coordinates.lon, -90.0715);
  assert.equal(parsed.coordinates.lat, 29.9511);
  assert.equal(parsed.tract.geoid, '22071013300');
  assert.equal(parsed.tract.state, '22');
  assert.equal(parsed.tract.name, 'Census Tract 133');
});

test('an empty addressMatches array is a no-match, not a crash', () => {
  assert.throws(
    () => parseCensusResponse({ result: { addressMatches: [] } }),
    (error) => error instanceof CensusNoMatchError && error.code === 'NO_MATCH',
  );
});

test('flood attributes: SFHA record wins and -9999 becomes null', () => {
  const parsed = parseFloodAttributes({
    features: [
      { attributes: { FLD_ZONE: 'X', SFHA_TF: 'F', STATIC_BFE: -9999, DEPTH: -9999 } },
      {
        attributes: {
          FLD_ZONE: 'AE',
          ZONE_SUBTY: null,
          SFHA_TF: 'T',
          STATIC_BFE: 12,
          DEPTH: -9999,
          V_DATUM: 'NAVD88',
          LEN_UNIT: 'Feet',
        },
      },
    ],
  });

  assert.equal(parsed.mapped, true);
  assert.equal(parsed.inSfha, true);
  assert.equal(parsed.attributes.FLD_ZONE, 'AE');
  assert.equal(parsed.attributes.STATIC_BFE, 12);
  assert.equal(parsed.attributes.DEPTH, null, '-9999 is FEMA’s null sentinel');
  assert.equal(parsed.attributes.ZONE_SUBTY, null);
  assert.equal(parsed.otherZoneCount, 1);
});

test('no FEMA features means unmapped, which is a valid answer', () => {
  const parsed = parseFloodAttributes({ features: [] });
  assert.deepEqual(parsed, { mapped: false, inSfha: false, attributes: null });
});

test('FEMA tile URLs cover the world at zoom 0 and reject out-of-range tiles', () => {
  const url = new URL(femaTileUrl({ x: 0, y: 0 }, 0));
  const [minX, minY, maxX, maxY] = url.searchParams.get('bbox').split(',').map(Number);
  assert.ok(Math.abs(minX + 20037508.342789244) < 1e-6);
  assert.ok(Math.abs(maxX - 20037508.342789244) < 1e-6);
  assert.ok(Math.abs(maxY - 20037508.342789244) < 1e-6);
  assert.ok(Math.abs(minY + 20037508.342789244) < 1e-6);
  assert.equal(url.searchParams.get('layers'), 'show:28');
  assert.equal(url.searchParams.get('transparent'), 'true');
  assert.equal(url.searchParams.get('f'), 'image');

  assert.equal(femaTileUrl({ x: 0, y: -1 }, 0), null);
  assert.equal(femaTileUrl({ x: 0, y: 4 }, 2), null);

  // Horizontal wrap normalizes rather than producing an invalid bbox.
  assert.equal(femaTileUrl({ x: 4, y: 0 }, 2), femaTileUrl({ x: 0, y: 0 }, 2));
});

test('tract query escapes quotes in the GEOID and asks for WGS84 geojson', () => {
  const params = tractQueryParams("22071013300' OR 1=1--");
  assert.equal(params.where, "GEOID='22071013300'' OR 1=1--'");
  assert.equal(params.outSR, '4326');
  assert.equal(params.f, 'geojson');
  assert.equal(params.returnGeometry, 'true');
  assert.match(tractQueryUrl(0), /Tracts_Blocks\/MapServer\/0\/query$/);
});
