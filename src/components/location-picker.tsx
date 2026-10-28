"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { T } from "./i18n";
const PinMap = dynamic(() => import("./pin-map"), {
  ssr: false,
  loading: () => <p role="status">Loading map…</p>,
});
export function LocationPicker({
  address,
  latitude,
  longitude,
  confirmed,
  onChange,
  onAddress,
}: {
  address: string;
  latitude: number | null;
  longitude: number | null;
  confirmed: boolean;
  onChange: (
    lat: number | null,
    lng: number | null,
    confirmed: boolean,
  ) => void;
  onAddress?: (address: string) => void;
}) {
  const [autocomplete, setAutocomplete] = useState(false),
    [attribution, setAttribution] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [suggestions, setSuggestions] = useState<
      { label: string; latitude: number; longitude: number }[]
    >([]);
  useEffect(() => {
    let active = true;
    fetch("/api/geocode")
      .then((r) => r.json())
      .then((d) => {
        if (active) setAutocomplete(d.autocomplete === true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!autocomplete || address.length < 5) return;
    let active = true;
    const timer = setTimeout(() => {
      fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, suggestions: true }),
      })
        .then(async (r) => {
          const d = await r.json();
          if (active && r.ok) {
            setSuggestions(d.suggestions ?? []);
            setAttribution(d.attribution ?? "");
          }
        })
        .catch(() => {});
    }, 1400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [address, autocomplete]);
  async function locate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, suggestions: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAttribution(result.attribution ?? "");
      setSuggestions(
        result.suggestions ?? [
          {
            label: address,
            latitude: result.latitude,
            longitude: result.longitude,
          },
        ],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Location lookup unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="location-picker">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy || address.length < 5}
        onClick={() => void locate()}
      >
        <T text={busy ? "Looking up address…" : "Find address suggestions"} />
      </button>
      {error && (
        <p role="status" className="notice">
          {error}
        </p>
      )}
      {suggestions.map((s, i) => (
        <button
          className="location-suggestion"
          type="button"
          key={i}
          onClick={() => {
            onChange(s.latitude, s.longitude, false);
            onAddress?.(s.label);
            setSuggestions([]);
          }}
        >
          {s.label}
        </button>
      ))}
      <p className="note">{attribution}</p>
      <div className="form-grid">
        {(["Latitude", "Longitude"] as const).map((label, i) => (
          <label className="form-field" key={label}>
            {label}
            <input
              type="number"
              step="any"
              min={i === 0 ? -90 : -180}
              max={i === 0 ? 90 : 180}
              value={(i === 0 ? latitude : longitude) ?? ""}
              onChange={(e) =>
                onChange(
                  i === 0
                    ? e.target.value === ""
                      ? null
                      : Number(e.target.value)
                    : latitude,
                  i === 1
                    ? e.target.value === ""
                      ? null
                      : Number(e.target.value)
                    : longitude,
                  false,
                )
              }
            />
          </label>
        ))}
      </div>
      {latitude !== null && longitude !== null && (
        <>
          <PinMap
            latitude={latitude}
            longitude={longitude}
            onChange={(lat, lng) => onChange(lat, lng, false)}
          />
          <label className="check-setting">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => onChange(latitude, longitude, e.target.checked)}
            />
            <T text="I confirm this service location" />
          </label>
        </>
      )}
      <p className="note">
        <T text="Choose a suggestion, drag the pin or enter coordinates. Location changes are saved only with the customer form." />
      </p>
    </div>
  );
}
