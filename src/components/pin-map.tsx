"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
export default function PinMap({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number;
  longitude: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !ref.current) return;
      const map = L.map(ref.current).setView([latitude, longitude], 16);
      L.tileLayer(
        process.env.NEXT_PUBLIC_MAP_TILE_URL ??
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "© OpenStreetMap contributors", maxZoom: 19 },
      ).addTo(map);
      const marker = L.marker([latitude, longitude], {
        draggable: true,
        icon: L.divIcon({
          className: "route-number-marker",
          html: "<span>●</span>",
          iconSize: [34, 34],
        }),
      }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        callback.current(p.lat, p.lng);
      });
      map.on("click", (e) => callback.current(e.latlng.lat, e.latlng.lng));
      cleanup = () => map.remove();
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [latitude, longitude]);
  return (
    <div
      ref={ref}
      className="route-map pin-map"
      aria-label="Service location map; use coordinate inputs for keyboard adjustment"
    />
  );
}
