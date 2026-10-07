import { useEffect, useRef } from "react";
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import { boundsOf, coreBounds, type LngLat } from "@/lib/polyline";
import { cn } from "@/lib/utils";

/**
 * MapLibre map that draws ride lines on a dark OpenFreeMap basemap
 * (free, no API key).
 *
 * Variants:
 *   heat   — many rides, thin translucent lines that brighten where they
 *            overlap; a cheap personal heatmap without a heatmap layer
 *   single — one ride, thick line with start/end dots
 *
 * The map is created once; changing `lines` swaps the GeoJSON data and
 * refits the view.
 */

// maplibre v6 finds its worker relative to its own module URL, which breaks
// once Vite prebundles or hashes it. Point it at the emitted asset instead.
setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const LINE_COLOR = "#fc4c02"; // --color-strava
const SOURCE = "rides";

interface RideMapProps {
  lines: LngLat[][];
  variant?: "heat" | "single";
  className?: string;
}

export function RideMap({ lines, variant = "heat", className }: RideMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  // Latest lines, read by the load handler in case data arrives first
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: [-98, 39],
      zoom: 3,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(SOURCE, { type: "geojson", data: toGeoJson(linesRef.current) });

      if (variant === "heat") {
        map.addLayer({
          id: "ride-lines",
          type: "line",
          source: SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": LINE_COLOR,
            "line-opacity": 0.35,
            "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 2, 16, 4],
          },
        });
      } else {
        map.addLayer({
          id: "ride-casing",
          type: "line",
          source: SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#020617", "line-width": 7, "line-opacity": 0.6 },
        });
        map.addLayer({
          id: "ride-lines",
          type: "line",
          source: SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": LINE_COLOR, "line-width": 4 },
        });
        map.addSource("endpoints", { type: "geojson", data: endpoints(linesRef.current) });
        map.addLayer({
          id: "endpoints",
          type: "circle",
          source: "endpoints",
          paint: {
            "circle-radius": 6,
            "circle-color": ["match", ["get", "kind"], "start", "#4ade80", "#f8fafc"],
            "circle-stroke-color": "#020617",
            "circle-stroke-width": 2,
          },
        });
      }

      loadedRef.current = true;
      fit(map, linesRef.current, variant, false);
    });

    return () => {
      loadedRef.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, [variant]);

  // Swap data when lines change after the map has loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(toGeoJson(lines));
    (map.getSource("endpoints") as GeoJSONSource | undefined)?.setData(endpoints(lines));
    fit(map, lines, variant, true);
  }, [lines, variant]);

  return <div ref={containerRef} className={cn("w-full h-full", className)} />;
}

function fit(map: MapLibreMap, lines: LngLat[][], variant: "heat" | "single", animate: boolean) {
  const b = variant === "heat" ? coreBounds(lines) : boundsOf(lines);
  if (!b) return;
  map.fitBounds(b, { padding: { top: 40, right: 56, bottom: 56, left: 40 }, maxZoom: 15, animate });
}

function toGeoJson(lines: LngLat[][]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: lines
      .filter((l) => l.length > 1)
      .map((coordinates) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      })),
  };
}

function endpoints(lines: LngLat[][]): GeoJSON.FeatureCollection {
  const line = lines[0];
  const first = line?.[0];
  const last = line?.[line.length - 1];
  if (!first || !last || line.length < 2) return { type: "FeatureCollection", features: [] };
  const point = (coordinates: LngLat, kind: string): GeoJSON.Feature => ({
    type: "Feature",
    properties: { kind },
    geometry: { type: "Point", coordinates },
  });
  // End first so the start dot draws on top for loops
  return {
    type: "FeatureCollection",
    features: [point(last, "end"), point(first, "start")],
  };
}
