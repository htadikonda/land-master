import { formatCoords } from '../lib/placeParse.js';
import { classifyZone, zoneCategory, zoneLabel } from '../lib/floodStyle.js';
import { STATE_NAMES } from '../lib/fips.js';

const DASH = '—';

export default function ReadoutPanel({
  place,
  census,
  tract,
  flood,
  expanded,
  onToggleExpanded,
  onRetryCensus,
  onRetryTract,
  onRetryFlood,
}) {
  if (!place) return null;

  const chip = floodChip(flood);

  return (
    <section
      className={expanded ? 'readout is-expanded' : 'readout'}
      aria-label="Property readout"
    >
      {/* Always visible: the panel header on desktop, the sheet peek on mobile. */}
      <header className="readout__peek">
        <div className="readout__peek-text">
          <p className="readout__eyebrow">Matched property</p>
          <h2 className="readout__address">{place.formattedAddress || 'Selected point'}</h2>
        </div>
        <span className={`chip chip--${chip.tone}`} role="status">
          <span className="chip__dot" aria-hidden="true" />
          {chip.text}
        </span>
        <button
          type="button"
          className="readout__handle"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-controls="readout-body"
        >
          <span className="readout__handle-icon" aria-hidden="true" />
          <span className="sr-only">{expanded ? 'Hide details' : 'Show details'}</span>
        </button>
      </header>

      <div className="readout__body" id="readout-body">
        <p className="readout__coords" data-mono>
          {formatCoords(place.lat, place.lng)}
        </p>

        {/* Flood ------------------------------------------------------- */}
        <SourceCard
          title="FEMA flood hazard"
          source="NFHL layer 28"
          status={flood.status}
          error={flood.error}
          onRetry={onRetryFlood}
          accent={chip.accent}
        >
          {flood.status === 'ok' && flood.mapped && (
            <div
              className="zone-display"
              style={{ '--zone': zoneCategory(flood.attributes).color }}
            >
              <span className="zone-display__code" data-mono>
                {flood.attributes.FLD_ZONE || '??'}
              </span>
              <span className="zone-display__meta">
                <span className="zone-display__label">{zoneCategory(flood.attributes).label}</span>
                <span className="zone-display__blurb">
                  {flood.attributes.ZONE_SUBTY
                    ? zoneLabel(flood.attributes)
                    : zoneCategory(flood.attributes).blurb}
                </span>
              </span>
            </div>
          )}

          {flood.status === 'ok' && !flood.mapped && (
            <p className="note">
              This point is outside every mapped Special Flood Hazard Area in the NFHL. That
              usually means Zone X (minimal risk), or a community FEMA has not mapped. No polygon
              is drawn.
            </p>
          )}

          {flood.status === 'ok' && flood.mapped && (
            <>
              <DataGrid
                rows={[
                  { label: 'FLD_ZONE', value: flood.attributes.FLD_ZONE },
                  { label: 'ZONE_SUBTY', value: flood.attributes.ZONE_SUBTY },
                  { label: 'SFHA_TF', value: flood.attributes.SFHA_TF },
                  {
                    label: 'STATIC_BFE',
                    value: measurement(flood.attributes.STATIC_BFE, flood.attributes.LEN_UNIT),
                  },
                  {
                    label: 'DEPTH',
                    value: measurement(flood.attributes.DEPTH, flood.attributes.LEN_UNIT),
                  },
                  { label: 'V_DATUM', value: flood.attributes.V_DATUM },
                ]}
              />
              {flood.otherZoneCount > 0 && (
                <p className="note">
                  {flood.otherZoneCount} additional overlapping zone
                  {flood.otherZoneCount === 1 ? '' : 's'} at this point; the governing SFHA record
                  is shown.
                </p>
              )}
              {flood.geojson === null && (
                <p className="note note--muted">Loading the flood polygon…</p>
              )}
            </>
          )}
        </SourceCard>

        {/* Tract ------------------------------------------------------- */}
        <SourceCard
          title="Census tract"
          source="Geocoder + TIGERweb"
          status={censusCardStatus(census, tract)}
          error={census.error || tract.error}
          onRetry={census.status === 'error' || census.status === 'nomatch' ? onRetryCensus : onRetryTract}
        >
          {census.status === 'nomatch' && (
            <p className="note">
              We couldn&apos;t match that address in the Census geocoder. Try a nearby street
              number, or include the ZIP code.
            </p>
          )}

          {census.status === 'ok' && (
            <>
              <DataGrid
                rows={[
                  { label: 'GEOID', value: census.tract?.geoid },
                  { label: 'Tract', value: census.tract?.name || census.tract?.basename },
                  { label: 'State', value: stateLabel(census.tract?.state) },
                  { label: 'County FIPS', value: census.tract?.county },
                  {
                    label: 'Census point',
                    value: census.coordinates
                      ? formatCoords(census.coordinates.lat, census.coordinates.lon)
                      : null,
                  },
                ]}
              />
              {census.matchedAddress && (
                <p className="note note--muted">Matched as: {census.matchedAddress}</p>
              )}
              {tract.status === 'loading' && (
                <p className="note note--muted">Loading the tract boundary…</p>
              )}
              {tract.status === 'error' && (
                <p className="note note--warn">
                  Tract attributes loaded, but the boundary polygon failed: {tract.error}
                </p>
              )}
            </>
          )}
        </SourceCard>
      </div>
    </section>
  );
}

/** Card wrapper with its own loading / error state, so one source can fail alone. */
function SourceCard({ title, source, status, error, onRetry, accent, children }) {
  return (
    <article className="card" data-accent={accent || undefined}>
      <header className="card__head">
        <h3 className="card__title">{title}</h3>
        <span className="card__source" data-mono>
          {source}
        </span>
      </header>

      <div className="card__content" aria-live="polite" aria-busy={status === 'loading'}>
        {status === 'idle' && <p className="note note--muted">Waiting…</p>}

        {status === 'loading' && (
          <div className="skeleton" role="status">
            <span className="skeleton__bar" />
            <span className="skeleton__bar" />
            <span className="skeleton__bar skeleton__bar--short" />
            <span className="sr-only">Loading {title}</span>
          </div>
        )}

        {status === 'error' && (
          <div className="failure">
            <p className="note note--warn">{error || 'This source is unavailable.'}</p>
            {onRetry && (
              <button type="button" className="btn btn--ghost" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        )}

        {status !== 'loading' && status !== 'error' && children}
      </div>
    </article>
  );
}

function DataGrid({ rows }) {
  return (
    <dl className="grid">
      {rows.map(({ label, value }) => (
        <div className="grid__row" key={label}>
          <dt className="grid__key">{label}</dt>
          <dd className="grid__val" data-mono data-empty={value ? undefined : 'true'}>
            {value || DASH}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function measurement(value, unit) {
  if (value === null || value === undefined) return null;
  const suffix = unit ? ` ${String(unit).toLowerCase().replace(/^feet$/, 'ft')}` : '';
  return `${value}${suffix}`;
}

function stateLabel(fips) {
  if (!fips) return null;
  const name = STATE_NAMES[fips];
  return name ? `${name} (${fips})` : fips;
}

/** The tract card reports Census status first; TIGERweb failures degrade to a note. */
function censusCardStatus(census, tract) {
  if (census.status === 'error') return 'error';
  if (census.status === 'nomatch') return 'nomatch';
  if (census.status === 'loading') return 'loading';
  if (census.status === 'ok') return 'ok';
  return tract.status === 'loading' ? 'loading' : 'idle';
}

function floodChip(flood) {
  switch (flood.status) {
    case 'loading':
      return { text: 'Checking FEMA…', tone: 'neutral' };
    case 'error':
      return { text: 'Flood data unavailable', tone: 'danger' };
    case 'ok': {
      if (!flood.mapped) {
        return { text: 'Outside mapped SFHA', tone: 'safe', accent: 'MINIMAL' };
      }
      const key = classifyZone(flood.attributes);
      if (flood.inSfha) {
        return { text: 'In SFHA — high risk', tone: 'alert', accent: key };
      }
      return { text: `Outside SFHA — ${zoneCategory(flood.attributes).label}`, tone: 'safe', accent: key };
    }
    default:
      return { text: 'No lookup yet', tone: 'neutral' };
  }
}
