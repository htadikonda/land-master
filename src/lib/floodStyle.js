/**
 * Flood-zone classification and map styling.
 *
 * FEMA encodes risk across two fields: FLD_ZONE ("AE", "VE", "X", "D") and
 * ZONE_SUBTY, which qualifies it ("FLOODWAY", "0.2 PCT ANNUAL CHANCE FLOOD
 * HAZARD"). A zone letter alone is not enough to color a polygon correctly, so
 * classification always considers both.
 */

export const ZONE_CATEGORIES = {
  FLOODWAY: {
    key: 'FLOODWAY',
    label: 'Regulatory floodway',
    blurb: 'Channel reserved to carry the base flood. Most restrictive.',
    color: '#e0653c',
    fillOpacity: 0.42,
  },
  HIGH_COASTAL: {
    key: 'HIGH_COASTAL',
    label: 'High risk — coastal (V/VE)',
    blurb: '1% annual chance flood with wave action.',
    color: '#b6519b',
    fillOpacity: 0.4,
  },
  HIGH_RIVERINE: {
    key: 'HIGH_RIVERINE',
    label: 'High risk (A/AE/AH/AO)',
    blurb: '1% annual chance flood. Special Flood Hazard Area.',
    color: '#2f80d0',
    fillOpacity: 0.36,
  },
  MODERATE: {
    key: 'MODERATE',
    label: 'Moderate risk (0.2% chance)',
    blurb: 'Shaded Zone X — 500-year floodplain.',
    color: '#d9a441',
    fillOpacity: 0.3,
  },
  MINIMAL: {
    key: 'MINIMAL',
    label: 'Minimal risk (Zone X)',
    blurb: 'Outside the 0.2% annual chance floodplain.',
    color: '#7d9a90',
    fillOpacity: 0.2,
  },
  UNDETERMINED: {
    key: 'UNDETERMINED',
    label: 'Undetermined (Zone D)',
    blurb: 'No flood hazard analysis has been conducted.',
    color: '#8d8f9c',
    fillOpacity: 0.24,
  },
  OTHER: {
    key: 'OTHER',
    label: 'Other / open water',
    blurb: 'Open water or area not included in the study.',
    color: '#4a7d92',
    fillOpacity: 0.26,
  },
};

/** Categories shown in the map legend, in risk order. */
export const LEGEND_ORDER = [
  'HIGH_RIVERINE',
  'HIGH_COASTAL',
  'FLOODWAY',
  'MODERATE',
  'MINIMAL',
  'UNDETERMINED',
];

const HIGH_RIVERINE = /^(A|AE|AH|AO|AR|A99|A\d{1,2})$/;
const HIGH_COASTAL = /^(V|VE|VO|V\d{1,2})$/;

/** Map a FEMA zone record to a category key. */
export function classifyZone(attributes) {
  if (!attributes) return 'MINIMAL';

  const zone = String(attributes.FLD_ZONE || '').trim().toUpperCase();
  const subtype = String(attributes.ZONE_SUBTY || '').trim().toUpperCase();

  if (subtype.includes('FLOODWAY')) return 'FLOODWAY';
  if (HIGH_COASTAL.test(zone)) return 'HIGH_COASTAL';
  if (HIGH_RIVERINE.test(zone)) return 'HIGH_RIVERINE';
  if (zone === 'D') return 'UNDETERMINED';
  if (zone === 'OPEN WATER' || subtype.includes('AREA NOT INCLUDED')) return 'OTHER';
  if (zone === 'X' || zone === 'B' || zone === 'C') {
    return subtype.includes('0.2 PCT') || subtype.includes('0.2%') ? 'MODERATE' : 'MINIMAL';
  }
  return 'OTHER';
}

export function zoneCategory(attributes) {
  return ZONE_CATEGORIES[classifyZone(attributes)] || ZONE_CATEGORIES.OTHER;
}

/** `google.maps.Data` style for a flood polygon. */
export function floodFeatureStyle(attributes) {
  const category = zoneCategory(attributes);
  return {
    fillColor: category.color,
    fillOpacity: category.fillOpacity,
    strokeColor: category.color,
    strokeOpacity: 0.95,
    strokeWeight: 2,
    zIndex: 2,
  };
}

/** A short human label for the zone, e.g. "AE — Floodway". */
export function zoneLabel(attributes) {
  if (!attributes) return null;
  const zone = attributes.FLD_ZONE || null;
  const subtype = attributes.ZONE_SUBTY || null;
  if (zone && subtype) return `${zone} — ${titleCase(subtype)}`;
  return zone || (subtype ? titleCase(subtype) : null);
}

function titleCase(text) {
  return String(text)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bPct\b/gi, 'PCT');
}
