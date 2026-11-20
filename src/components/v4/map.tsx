'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from '@/components/design/icon';
import { useLanguage } from '@/components/i18n';
import { directionsUrl, stopCoordinates } from '@/lib/v4/directions';
import type { Stop } from '@/lib/v4/types';
import './map.css';

const layers = {
  Street: {
    url: process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    credit: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  },
  Satellite: {
    url: process.env.NEXT_PUBLIC_SATELLITE_TILE_URL || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    credit: 'Imagery &copy; <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri and its imagery providers</a>',
  },
};

const fitOptions = { padding: [42, 54] as [number, number], maxZoom: 15, animate: false };

type Pin = { id: string; coordinates: [number, number]; number: number; name: string; done: boolean };

function MapCanvas({ pinsJSON, layer, selected, onSelect }: {
  pinsJSON: string;
  layer: keyof typeof layers;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const markers = useRef(new Map<string, Marker>());
  const [engine, setEngine] = useState<{ L: typeof import('leaflet'); map: LeafletMap } | null>(null);
  const [mapError, setMapError] = useState(false);
  const [failedLayer, setFailedLayer] = useState<string | null>(null);
  const { t } = useLanguage();
  const pins = useMemo(() => JSON.parse(pinsJSON) as Pin[], [pinsJSON]);
  const coordinates = useMemo(() => pins.map(pin => pin.coordinates), [pins]);
  const missingTiles = failedLayer === layer;

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | undefined;
    let observer: ResizeObserver | undefined;
    void import('leaflet').then(L => {
      if (cancelled || !container.current) return;
      map = L.map(container.current, { scrollWheelZoom: false, zoomControl: false });
      L.control.zoom({ position: 'topright' }).addTo(map);
      observer = new ResizeObserver(() => map?.invalidateSize());
      observer.observe(container.current);
      setEngine({ L, map });
    }).catch(() => { if (!cancelled) setMapError(true); });
    return () => { cancelled = true; observer?.disconnect(); map?.remove(); };
  }, []);

  useEffect(() => {
    if (!engine) return;
    const { L, map } = engine;
    const { url, credit } = layers[layer];
    const tiles = L.tileLayer(url, { attribution: credit, maxZoom: 19 });
    tiles.on('tileerror', () => setFailedLayer(layer));
    tiles.on('tileload', () => setFailedLayer(null));
    tiles.addTo(map);
    return () => { tiles.off(); tiles.remove(); };
  }, [engine, layer]);

  useEffect(() => {
    if (!engine) return;
    const { L, map } = engine;
    const group = L.layerGroup().addTo(map);
    const lookup = new Map<string, Marker>();
    for (const pin of pins) {
      const label = document.createElement('span');
      label.textContent = String(pin.number);
      const icon = L.divIcon({
        className: 'v4-map-pin' + (pin.done ? ' is-done' : ''),
        html: label,
        iconSize: [44, 48], iconAnchor: [22, 46],
      });
      const marker = L.marker(pin.coordinates, { icon, title: pin.name, keyboard: true })
        .on('click', () => onSelect(pin.id))
        .addTo(group);
      marker.getElement()?.setAttribute('aria-label', pin.number + '. ' + pin.name);
      lookup.set(pin.id, marker);
    }
    markers.current = lookup;
    map.fitBounds(L.latLngBounds(coordinates), fitOptions);
    return () => { group.remove(); };
  }, [engine, pins, coordinates, onSelect]);

  useEffect(() => {
    if (!engine || !missingTiles || coordinates.length < 2) return;
    const path = engine.L.polyline(coordinates, {
      color: '#387792', weight: 3, dashArray: '2 9', lineCap: 'round',
      interactive: false, className: 'v4-map-stop-sequence',
    }).addTo(engine.map);
    return () => { path.remove(); };
  }, [engine, missingTiles, coordinates]);

  useEffect(() => {
    for (const [id, marker] of markers.current) {
      const active = id === selected;
      marker.getElement()?.classList.toggle('is-selected', active);
      marker.getElement()?.setAttribute('aria-pressed', String(active));
      marker.setZIndexOffset(active ? 1000 : 0);
      if (active && engine && !engine.map.getBounds().contains(marker.getLatLng())) {
        engine.map.panTo(marker.getLatLng(), { animate: false });
      }
    }
  }, [engine, selected, pinsJSON]);

  return <div className="v4-map-stage">
    <div ref={container} className={'v4-map-canvas' + (missingTiles ? ' v4-map-grid' : '')} role="region" aria-label={t('Route map')}/>
    {mapError && <p className="v4-map-warning" role="status">{t('Map unavailable. Select a stop below.')}</p>}
    {missingTiles && engine && <div className="v4-map-fallback">
      <p role="status">{t('Basemap unavailable.')} {coordinates.length > 1 && t('Dotted line shows stop order.')}</p>
      <button type="button" onClick={() => engine.map.fitBounds(engine.L.latLngBounds(coordinates), fitOptions)}>
        {t('Show all pins')}
      </button>
    </div>}
  </div>;
}

export function RouteMap({ stops, onOpen }: { stops: Stop[]; onOpen: (id: string) => void }) {
  const { t } = useLanguage();
  const [selectedId, setSelectedId] = useState('');
  const [layer, setLayer] = useState<keyof typeof layers>('Street');
  const selected = stops.find(stop => stop.id === selectedId) ?? stops.find(stop => !stop.completedAt) ?? stops[0];
  const pins = stops.flatMap((stop, index): Pin[] => {
    const coordinates = stopCoordinates(stop);
    return coordinates ? [{ id: stop.id, coordinates, number: index + 1, name: stop.name, done: !!stop.completedAt }] : [];
  });
  if (!selected) return <p className="v4-map-empty">{t('No stops scheduled.')}</p>;

  return <section className="v4-map-panel" aria-label={t('Route map')}>
    {pins.length > 0 ? <>
      <MapCanvas pinsJSON={JSON.stringify(pins)} layer={layer} selected={selected.id} onSelect={setSelectedId}/>
      <div role="group" aria-label={t('Map style')} className="v4-map-switch">
        {(['Street', 'Satellite'] as const).map(style =>
          <button key={style} type="button" aria-pressed={layer === style} onClick={() => setLayer(style)}>{t(style)}</button>)}
      </div>
    </> : <p className="v4-map-empty">{t('No coordinates for these stops.')}</p>}
    <div className="v4-map-stop">
      <label><span>{t('Route stop')}</span>
        <select value={selected.id} onChange={event => setSelectedId(event.target.value)}>
          {stops.map((stop, index) => <option key={stop.id} value={stop.id}>{index + 1}. {stop.name}</option>)}
        </select>
      </label>
      <p><Icon name="pin" width="16" height="16"/>{selected.address}</p>
      <div className="v4-map-actions">
        <a href={directionsUrl(selected)} target="_blank" rel="noreferrer"><Icon name="route"/>{t('Directions')}</a>
        <button type="button" onClick={() => onOpen(selected.id)}>{t('Open visit')}<Icon name="arrow"/></button>
      </div>
    </div>
  </section>;
}

export default RouteMap;
