const TOGGLES = [
  { key: 'floodTiles', label: 'FEMA flood tiles', hint: 'NFHL raster across the whole map' },
  { key: 'tract', label: 'Census tract', hint: 'Boundary of the matched tract' },
  { key: 'floodPolygon', label: 'Flood zone at point', hint: 'Polygon containing this address' },
];

export default function LayerToggles({ layers, onChange, disabled }) {
  return (
    <fieldset className="toggles">
      <legend className="toggles__legend">Layers</legend>
      {TOGGLES.map(({ key, label, hint }) => (
        <label className="toggles__row" key={key}>
          <input
            type="checkbox"
            checked={Boolean(layers[key])}
            onChange={(event) => onChange(key, event.target.checked)}
            disabled={disabled?.[key]}
          />
          <span className="toggles__text">
            <span className="toggles__label">{label}</span>
            <span className="toggles__hint">{hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
