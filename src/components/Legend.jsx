import { LEGEND_ORDER, ZONE_CATEGORIES } from '../lib/floodStyle.js';

/** Flood-zone color key for the polygons and the optional tile overlay. */
export default function Legend({ activeKey }) {
  return (
    <aside className="legend" aria-label="Flood zone legend">
      <h2 className="legend__title">Flood zones</h2>
      <ul className="legend__list">
        {LEGEND_ORDER.map((key) => {
          const category = ZONE_CATEGORIES[key];
          const active = key === activeKey;
          return (
            <li key={key} className={active ? 'legend__item is-active' : 'legend__item'}>
              <span
                className="legend__swatch"
                style={{ '--swatch': category.color }}
                aria-hidden="true"
              />
              <span className="legend__label">{category.label}</span>
              {active && <span className="legend__here">this point</span>}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
