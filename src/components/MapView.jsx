import { useEffect, useRef } from 'react';
import { AdvancedMarker, Map, Marker, useMap } from '@vis.gl/react-google-maps';
import { femaTileUrl } from '../lib/fema.js';
import { floodFeatureStyle } from '../lib/floodStyle.js';

const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || undefined;

/** Continental US, so the first paint is never an empty ocean. */
const DEFAULT_CENTER = { lat: 39.5, lng: -98.35 };
const DEFAULT_ZOOM = 4;
const ADDRESS_ZOOM = 16;

const TRACT_STYLE = {
  fillColor: '#3ddc97',
  fillOpacity: 0.06,
  strokeColor: '#3ddc97',
  strokeOpacity: 0.9,
  strokeWeight: 2,
  zIndex: 1,
};

export default function MapView({ point, tractGeoJson, floodGeoJson, layers }) {
  return (
    <div className="map">
      <Map
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={DEFAULT_ZOOM}
        mapId={MAP_ID}
        gestureHandling="greedy"
        clickableIcons={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl
        style={{ width: '100%', height: '100%' }}
      >
        <CameraController point={point} />
        <PropertyMarker point={point} />
        <GeoJsonLayer
          geojson={layers.tract ? tractGeoJson : null}
          style={TRACT_STYLE}
          label="census tract"
        />
        <GeoJsonLayer
          geojson={layers.floodPolygon ? floodGeoJson : null}
          style={floodDataStyle}
          label="flood zone"
        />
        <FemaTileLayer visible={layers.floodTiles} />
      </Map>
    </div>
  );
}

/** `google.maps.Data` calls this per feature; GeoJSON properties carry the FEMA attributes. */
function floodDataStyle(feature) {
  return floodFeatureStyle({
    FLD_ZONE: feature.getProperty('FLD_ZONE'),
    ZONE_SUBTY: feature.getProperty('ZONE_SUBTY'),
  });
}

function CameraController({ point }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !point) return;
    map.panTo({ lat: point.lat, lng: point.lng });
    if ((map.getZoom() ?? 0) < ADDRESS_ZOOM) map.setZoom(ADDRESS_ZOOM);
  }, [map, point]);

  return null;
}

function PropertyMarker({ point }) {
  const map = useMap();
  if (!point || !map) return null;

  const position = { lat: point.lat, lng: point.lng };

  // Advanced markers need a Map ID. Without one configured, the classic marker
  // is the correct choice — it renders on a raster map with no extra setup.
  if (MAP_ID) {
    return (
      <AdvancedMarker position={position} title={point.label || 'Selected property'}>
        <div className="marker" aria-hidden="true">
          <span className="marker__ring" />
          <span className="marker__dot" />
        </div>
      </AdvancedMarker>
    );
  }

  return (
    <Marker
      position={position}
      title={point.label || 'Selected property'}
      icon={{
        path: window.google?.maps?.SymbolPath?.CIRCLE ?? 0,
        scale: 7,
        fillColor: '#3ddc97',
        fillOpacity: 1,
        strokeColor: '#08211c',
        strokeWeight: 3,
      }}
      zIndex={10}
    />
  );
}

/**
 * Renders a GeoJSON FeatureCollection on its own `google.maps.Data` layer.
 *
 * One layer per source keeps the toggles independent — clearing the flood
 * overlay can never disturb the tract boundary. Passing `null` removes the
 * layer entirely, which is how visibility is implemented.
 */
function GeoJsonLayer({ geojson, style, label }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map || !geojson || !window.google?.maps) return undefined;

    const data = new window.google.maps.Data();
    layerRef.current = data;

    try {
      data.addGeoJson(geojson);
    } catch (error) {
      console.warn(`Land Master: could not draw the ${label} geometry.`, error);
      return undefined;
    }

    data.setStyle(style);
    data.setMap(map);

    return () => {
      data.setMap(null);
      data.forEach((feature) => data.remove(feature));
      layerRef.current = null;
    };
  }, [map, geojson, style, label]);

  return null;
}

/**
 * Optional FEMA NFHL raster overlay across the whole viewport.
 *
 * Map tiles are plain images, so they are exempt from CORS — this works from a
 * static origin without any proxy.
 */
function FemaTileLayer({ visible }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !visible || !window.google?.maps) return undefined;

    const overlay = new window.google.maps.ImageMapType({
      name: 'FEMA NFHL',
      getTileUrl: (coord, zoom) => femaTileUrl(coord, zoom),
      tileSize: new window.google.maps.Size(256, 256),
      opacity: 0.55,
      maxZoom: 20,
    });

    map.overlayMapTypes.push(overlay);

    return () => {
      const index = map.overlayMapTypes.getArray().indexOf(overlay);
      if (index >= 0) map.overlayMapTypes.removeAt(index);
    };
  }, [map, visible]);

  return null;
}
