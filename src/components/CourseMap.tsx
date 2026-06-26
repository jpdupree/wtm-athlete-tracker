"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  COURSE_URL,
  findLoop,
  indexLoop,
  obstacleLabel,
  pointAtFraction,
  type CourseData,
  type LonLat,
  type LoopIndex,
} from "@/lib/course";

export type MapAthlete = {
  bib: number;
  name: string;
  fraction: number;
  color: string;
};

const toLatLng = ([lon, lat]: LonLat): [number, number] => [lat, lon];

const OBSTACLE_COLOR = "#e8772e"; // matches --wtm-accent
const LOOP_COLOR = "#e8772e";
const DIVERSION_COLOR = "#9aa0a6";

export function CourseMap({ athletes }: { athletes: MapAthlete[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const loopIdxRef = useRef<LoopIndex | null>(null);
  const athleteLayerRef = useRef<L.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Init map + draw static course once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      scrollWheelZoom: true,
      attributionControl: true,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    athleteLayerRef.current = L.layerGroup().addTo(map);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(COURSE_URL, { cache: "force-cache" });
        if (!res.ok) throw new Error(`course ${res.status}`);
        const data = (await res.json()) as CourseData;
        if (cancelled) return;
        drawCourse(map, data);
        const loop = findLoop(data);
        if (loop) loopIdxRef.current = indexLoop(loop);
        if (data.bbox) {
          map.fitBounds(
            [
              [data.bbox[1], data.bbox[0]],
              [data.bbox[3], data.bbox[2]],
            ],
            { padding: [24, 24] },
          );
        }
        setReady(true);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
      loopIdxRef.current = null;
      athleteLayerRef.current = null;
    };
  }, []);

  // Redraw athlete dots whenever positions change.
  useEffect(() => {
    const layer = athleteLayerRef.current;
    const idx = loopIdxRef.current;
    if (!ready || !layer || !idx) return;
    layer.clearLayers();
    for (const a of athletes) {
      const [lat, lng] = toLatLng(pointAtFraction(idx, a.fraction));
      L.circleMarker([lat, lng], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: a.color,
        fillOpacity: 1,
      })
        .bindTooltip(a.name, {
          permanent: true,
          direction: "top",
          offset: [0, -6],
          className: "wtm-athlete-label",
        })
        .addTo(layer);
    }
  }, [athletes, ready]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[68vh] min-h-[420px] w-full rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--wtm-border)" }}
      />
      {error && (
        <p className="absolute inset-x-0 top-2 mx-auto w-fit rounded-md bg-red-500/10 px-3 py-1 text-xs text-red-600">
          Course failed to load: {error}
        </p>
      )}
    </div>
  );
}

function drawCourse(map: L.Map, data: CourseData) {
  for (const f of data.features) {
    const { folder, name, obstacleNum, kind } = f.properties;

    if (kind === "linestring") {
      const coords = (f.geometry as { coordinates: LonLat[] }).coordinates.map(
        toLatLng,
      );
      const isDiversion = /diversion/i.test(name);
      L.polyline(coords, {
        color: isDiversion ? DIVERSION_COLOR : LOOP_COLOR,
        weight: isDiversion ? 3 : 4,
        opacity: isDiversion ? 0.7 : 0.95,
        dashArray: isDiversion ? "6 6" : undefined,
      }).addTo(map);
      continue;
    }

    if (kind === "polygon") {
      const ring = (f.geometry as { coordinates: LonLat[][] }).coordinates[0].map(
        toLatLng,
      );
      L.polygon(ring, {
        color: DIVERSION_COLOR,
        weight: 1,
        fillOpacity: 0.08,
      })
        .bindTooltip(name || "Venue", { direction: "center" })
        .addTo(map);
      continue;
    }

    // Points: obstacles, mile markers, water station, venue label.
    const [lat, lng] = toLatLng(
      (f.geometry as { coordinates: LonLat }).coordinates,
    );

    if (folder === "Obstacles" && obstacleNum != null) {
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          html: `<div style="width:20px;height:20px;border-radius:50%;background:${OBSTACLE_COLOR};color:#fff;font:700 11px/20px system-ui,sans-serif;text-align:center;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${obstacleNum}</div>`,
        }),
      })
        .bindTooltip(obstacleLabel(name), { direction: "top" })
        .addTo(map);
      continue;
    }

    if (folder === "Mile Markers") {
      L.circleMarker([lat, lng], {
        radius: 4,
        color: "#fff",
        weight: 1,
        fillColor: "#3b82f6",
        fillOpacity: 0.9,
      })
        .bindTooltip("Mile marker", { direction: "top" })
        .addTo(map);
      continue;
    }

    if (/water/i.test(name)) {
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          html: `<div style="width:18px;height:18px;border-radius:4px;background:#0ea5e9;color:#fff;font:700 11px/18px system-ui,sans-serif;text-align:center;border:1.5px solid #fff">W</div>`,
        }),
      })
        .bindTooltip("Water Station", { direction: "top" })
        .addTo(map);
      continue;
    }

    // Anything else (venue label point, etc.) — a small neutral dot.
    L.circleMarker([lat, lng], {
      radius: 3,
      color: "#fff",
      weight: 1,
      fillColor: DIVERSION_COLOR,
      fillOpacity: 0.8,
    })
      .bindTooltip(name || "", { direction: "top" })
      .addTo(map);
  }

  // Start/finish marker at the loop's first vertex.
  const loop = findLoop(data);
  if (loop) {
    const start = (loop.geometry as { coordinates: LonLat[] }).coordinates[0];
    const [lat, lng] = toLatLng(start);
    L.marker([lat, lng], {
      icon: L.divIcon({
        className: "",
        iconSize: [44, 18],
        iconAnchor: [22, 9],
        html: `<div style="padding:0 6px;height:18px;border-radius:4px;background:#111;color:#fff;font:700 10px/18px system-ui,sans-serif;text-align:center;border:1.5px solid #fff;letter-spacing:.05em">START</div>`,
      }),
    })
      .bindTooltip("Start / Finish", { direction: "top" })
      .addTo(map);
  }
}
