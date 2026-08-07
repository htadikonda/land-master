import { useCallback, useEffect, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import AddressSearch from './components/AddressSearch.jsx';
import LayerToggles from './components/LayerToggles.jsx';
import Legend from './components/Legend.jsx';
import MapView from './components/MapView.jsx';
import ReadoutPanel from './components/ReadoutPanel.jsx';
import { useLookup, floodPoint } from './hooks/useLookup.js';
import { classifyZone } from './lib/floodStyle.js';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const DEFAULT_LAYERS = { floodTiles: false, tract: true, floodPolygon: true };

export default function App() {
  const { place, census, tract, flood, lookup, retryCensus, retryTract, retryFlood } = useLookup();
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [notice, setNotice] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [mapsError, setMapsError] = useState(null);

  const handleLayerChange = useCallback((key, value) => {
    setLayers((current) => ({ ...current, [key]: value }));
  }, []);

  const handleSelect = useCallback(
    (nextPlace) => {
      setNotice(null);
      setExpanded(true);
      lookup(nextPlace);
    },
    [lookup],
  );

  // The marker sits on the point FEMA was queried at, so what you see and what
  // the readout reports can never drift apart.
  const point = useMemo(() => {
    const coords = floodPoint(place, census);
    if (!coords) return null;
    return { ...coords, label: place?.formattedAddress };
  }, [place, census]);

  const activeZoneKey =
    flood.status === 'ok' && flood.mapped ? classifyZone(flood.attributes) : null;

  if (!API_KEY) return <MissingKey />;

  return (
    <APIProvider
      apiKey={API_KEY}
      libraries={['places']}
      version="weekly"
      onError={(error) => setMapsError(error?.message || 'Google Maps failed to load.')}
    >
      <div className="app">
        <MapView
          point={point}
          tractGeoJson={tract.status === 'ok' ? tract.geojson : null}
          floodGeoJson={flood.status === 'ok' ? flood.geojson : null}
          layers={layers}
        />

        <div className={expanded ? 'hud is-sheet-open' : 'hud'}>
          <div className="hud__top">
            <header className="brand">
              <h1 className="brand__mark">
                Land<span className="brand__mark-alt">Master</span>
              </h1>
              <p className="brand__sub" data-mono>
                FEMA NFHL · US CENSUS TIGER
              </p>
            </header>

            <AddressSearch onSelect={handleSelect} onNotice={setNotice} />

            {(notice || mapsError) && (
              <p className="banner" role="alert">
                {mapsError || notice}
              </p>
            )}
          </div>

          <div className="hud__side">
            <LayerToggles
              layers={layers}
              onChange={handleLayerChange}
              disabled={{
                tract: tract.status !== 'ok',
                floodPolygon: !(flood.status === 'ok' && flood.geojson),
              }}
            />
            <Legend activeKey={activeZoneKey} />
          </div>

          <ReadoutPanel
            place={place}
            census={census}
            tract={tract}
            flood={flood}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((value) => !value)}
            onRetryCensus={retryCensus}
            onRetryTract={retryTract}
            onRetryFlood={retryFlood}
          />
        </div>
      </div>
    </APIProvider>
  );
}

/** Without a key the Maps script can't load at all, so say exactly what to do. */
function MissingKey() {
  useEffect(() => {
    document.title = 'Land Master — configuration needed';
  }, []);

  return (
    <main className="setup">
      <h1 className="setup__title">
        Land<span className="brand__mark-alt">Master</span>
      </h1>
      <p className="setup__lede">
        No Google Maps key found. Land Master reads it from{' '}
        <code data-mono>VITE_GOOGLE_MAPS_API_KEY</code> at build time.
      </p>
      <ol className="setup__steps">
        <li>
          Copy <code data-mono>.env.example</code> to <code data-mono>.env</code>.
        </li>
        <li>
          Set <code data-mono>VITE_GOOGLE_MAPS_API_KEY</code> to a browser key with the Maps
          JavaScript API and Places API enabled.
        </li>
        <li>
          Restart <code data-mono>npm run dev</code> — Vite only reads env files at startup.
        </li>
      </ol>
      <p className="setup__note">
        For GitHub Pages, add the same value as the repository secret{' '}
        <code data-mono>VITE_GOOGLE_MAPS_API_KEY</code>; the deploy workflow injects it at build.
      </p>
    </main>
  );
}
