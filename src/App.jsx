import { useCallback, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import AddressSearch from './components/AddressSearch.jsx';
import KeyGate from './components/KeyGate.jsx';
import LayerToggles from './components/LayerToggles.jsx';
import Legend from './components/Legend.jsx';
import MapView from './components/MapView.jsx';
import ReadoutPanel from './components/ReadoutPanel.jsx';
import { useApiKey } from './hooks/useApiKey.js';
import { useLookup, floodPoint } from './hooks/useLookup.js';
import { maskKey } from './lib/apiKey.js';
import { classifyZone } from './lib/floodStyle.js';

const DEFAULT_LAYERS = { floodTiles: false, tract: true, floodPolygon: true };

export default function App() {
  const { apiKey, source, hasBuildKey, persistFailed, saveKey, forgetKey } = useApiKey();
  const { place, census, tract, flood, lookup, retryCensus, retryTract, retryFlood } = useLookup();
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [notice, setNotice] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [mapsError, setMapsError] = useState(null);
  const [keyPanelOpen, setKeyPanelOpen] = useState(false);

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

  // Without a key the Maps script cannot load at all, so the gate is the whole
  // page rather than an overlay.
  if (!apiKey) {
    return <KeyGate variant="setup" persistFailed={persistFailed} onSubmit={saveKey} />;
  }

  return (
    <APIProvider
      apiKey={apiKey}
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
                <span>{mapsError || notice}</span>
                {mapsError && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--tiny"
                    onClick={() => setKeyPanelOpen(true)}
                  >
                    Change key
                  </button>
                )}
              </p>
            )}

            <p className="keychip">
              <span className="keychip__label">Maps key</span>
              <code data-mono>{maskKey(apiKey)}</code>
              <span className="keychip__source">
                {source === 'stored' ? 'this browser' : 'built in'}
              </span>
              <button type="button" className="linkbtn" onClick={() => setKeyPanelOpen(true)}>
                change
              </button>
            </p>
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

      {keyPanelOpen && (
        <KeyGate
          variant="overlay"
          currentKey={apiKey}
          source={source}
          hasBuildKey={hasBuildKey}
          persistFailed={persistFailed}
          loadError={mapsError}
          onSubmit={saveKey}
          onForget={forgetKey}
          onCancel={() => setKeyPanelOpen(false)}
        />
      )}
    </APIProvider>
  );
}
