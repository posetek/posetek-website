// The rep's complete saved evidence, beside the frame viewer: every per-frame
// series plotted against the frame cursor (click to seek), the scene geometry
// the phone measured with, and every file in the rep folder and session root.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import type { SceneEvidence, SeriesGroup } from "../lib/repEvidence";

// Reference categorical slots 1–3 (validated on the light surface; slot 3 is
// under 3:1, so every chart has a legend and a hover readout).
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];

export interface EvidenceEvent { label: string; frame: number }

export function SeriesCharts({ groups, frame, lastFrame, fps, events, seekTo }: {
  groups: SeriesGroup[];
  frame: number;
  lastFrame: number;
  fps: number | null;
  events: EvidenceEvent[];
  seekTo: (frame: number) => void;
}) {
  if (!groups.length) return null;
  return (
    <section className="admin-card re-charts">
      <h3>Per-frame data</h3>
      <p className="admin-note">Every per-frame series the phone saved. The line marks the current frame; click a chart to jump there.</p>
      {groups.map(group => <SeriesChart key={group.key} group={group} frame={frame} lastFrame={lastFrame} fps={fps} events={events} seekTo={seekTo} />)}
    </section>
  );
}

function SeriesChart({ group, frame, lastFrame, fps, events, seekTo }: {
  group: SeriesGroup; frame: number; lastFrame: number; fps: number | null; events: EvidenceEvent[]; seekTo: (frame: number) => void;
}) {
  const width = 640, height = 132, left = 44, right = 10, top = 10, bottom = 20;
  const [hover, setHover] = useState<number | null>(null);
  const domain = Math.max(1, lastFrame, ...group.series.map(series => series.values.length - 1));
  const { min, max } = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const series of group.series) for (const value of series.values) if (value !== null) { lo = Math.min(lo, value); hi = Math.max(hi, value); }
    if (lo > 0 && lo / Math.max(hi, 1e-9) < 0.5) lo = 0;
    if (hi === lo) { hi += 1; lo -= 1; }
    return { min: lo, max: hi };
  }, [group]);
  const x = (f: number) => left + (f / domain) * (width - left - right);
  const y = (v: number) => top + (1 - (v - min) / (max - min)) * (height - top - bottom);
  const paths = group.series.map(series => {
    let d = "";
    let open = false;
    series.values.forEach((value, f) => {
      if (value === null) { open = false; return; }
      d += `${open ? "L" : "M"}${x(f).toFixed(1)},${y(value).toFixed(1)}`;
      open = true;
    });
    return d;
  });
  const frameAt = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    return Math.max(0, Math.min(domain, Math.round(((px - left) / (width - left - right)) * domain)));
  };
  const shown = hover ?? frame;
  const format = (value: number | null) => (value === null ? "—" : Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2));
  const ticks = [min, (min + max) / 2, max];

  return (
    <figure className="re-chart">
      <figcaption>
        <strong>{group.title}</strong> <span className="admin-note">({group.unit})</span>
        {group.series.length > 1 && (
          <span className="re-legend">
            {group.series.map((series, index) => <span key={series.name}><i style={{ background: SERIES_COLORS[index] }} />{series.label}</span>)}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${group.title} by frame`}
        onMouseMove={event => setHover(frameAt(event))} onMouseLeave={() => setHover(null)} onClick={event => seekTo(frameAt(event))}>
        {ticks.map(value => (
          <g key={value}>
            <line className="re-grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
            <text className="re-axis" x={left - 6} y={y(value) + 4} textAnchor="end">{format(value)}</text>
          </g>
        ))}
        {events.filter(event => event.frame >= 0 && event.frame <= domain).map(event => (
          <g key={`${event.label}-${event.frame}`}>
            <line className="re-event" x1={x(event.frame)} x2={x(event.frame)} y1={top} y2={height - bottom} />
            <text className="re-axis" x={x(event.frame)} y={height - 6} textAnchor="middle">{event.label}</text>
          </g>
        ))}
        {paths.map((d, index) => <path key={group.series[index].name} d={d} fill="none" stroke={SERIES_COLORS[index]} strokeWidth={2} strokeLinejoin="round" />)}
        <line className="re-cursor" x1={x(frame)} x2={x(frame)} y1={top} y2={height - bottom} />
        {hover !== null && <line className="re-hover" x1={x(hover)} x2={x(hover)} y1={top} y2={height - bottom} />}
        {group.series.map((series, index) => {
          const value = series.values[shown];
          return value === null || value === undefined ? null : <circle key={series.name} cx={x(shown)} cy={y(value)} r={4} fill={SERIES_COLORS[index]} className="re-dot" />;
        })}
      </svg>
      <p className="re-readout">
        frame {shown}{fps ? ` · ${(shown / fps).toFixed(3)} s` : ""}
        {group.series.map(series => <span key={series.name}> · {series.label} {format(series.values[shown] ?? null)}</span>)}
      </p>
    </figure>
  );
}

function summarize(value: any): string {
  if (Array.isArray(value)) {
    const finite = value.filter(entry => entry !== null && entry !== undefined).length;
    return `array · ${value.length} entries${finite !== value.length ? ` (${value.length - finite} empty)` : ""}`;
  }
  if (value && typeof value === "object") return `object · ${Object.keys(value).length} keys`;
  return typeof value;
}

function preview(value: any): string {
  const text = JSON.stringify(value, null, 1) ?? "";
  return text.length > 6000 ? `${text.slice(0, 6000)}\n… (${(text.length / 1024).toFixed(0)} KB total)` : text;
}

function FileList({ title, files, json }: { title: string; files: string[]; json: Record<string, any> }) {
  const names = [...new Set([...files, ...Object.keys(json)])].sort();
  return (
    <div className="re-files">
      <h4>{title}</h4>
      {!names.length && <p className="admin-note">No files listed.</p>}
      {names.map(name => (
        Object.hasOwn(json, name) ? (
          <details key={name}>
            <summary><code>{name}</code> <span className="admin-note">{summarize(json[name])}</span></summary>
            <pre>{preview(json[name])}</pre>
          </details>
        ) : (
          <p key={name} className="re-file-plain"><code>{name}</code> <span className="admin-note">{/\.(mov|mp4)$/i.test(name) ? "video" : /\.json$/i.test(name) ? "not read" : "not JSON"}</span></p>
        )
      ))}
    </div>
  );
}

export function SavedEvidence({ scene, files, json, sessionFiles, sessionJson, folder, sessionRoot }: {
  scene: SceneEvidence;
  files: string[];
  json: Record<string, any>;
  sessionFiles: string[];
  sessionJson: Record<string, any>;
  folder: string;
  sessionRoot: string;
}) {
  const repMarkers = scene.markers.filter(marker => marker.source !== "session.calibration");
  const calibrationMarkers = scene.calibrationMarkers;
  const drawnFromCalibration = scene.markers.some(marker => marker.source === "session.calibration");
  const describe = (marker: (typeof scene.markers)[number]) => `ID ${marker.id ?? "?"}${marker.role ? ` (${marker.role})` : ""}${marker.corners.length ? "" : ", center only"}`;
  return (
    <section className="admin-card re-saved">
      <h3>Saved data</h3>
      <ul className="re-scene">
        <li><strong>Markers in this clip:</strong> {repMarkers.length ? repMarkers.map(describe).join(", ") : "none saved"}</li>
        <li><strong>Calibration photo markers:</strong> {calibrationMarkers.length ? calibrationMarkers.map(describe).join(", ") : "none saved"}{calibrationMarkers.length ? (drawnFromCalibration ? " (drawn dashed: this clip saved no markers of its own)" : !scene.calibrationTrusted ? " (not drawn: lens geometry did not match this clip)" : " (not drawn: this clip has its own markers)") : ""}</li>
        <li><strong>Ground:</strong> {scene.lines.filter(line => line.kind === "ground").map(line => line.source).join(", ") || "not saved"}</li>
        {scene.separation && (
          <li><strong>Marker separation:</strong> measured {scene.separation.measuredMeters.toFixed(2)} m from the markers' own size
            {scene.separation.configuredMeters !== null ? `; processing used ${scene.separation.configuredMeters.toFixed(2)} m${scene.separation.configuredSource ? ` (${scene.separation.configuredSource})` : ""}, a ${(scene.separation.difference! * 100).toFixed(1)}% difference` : "; no configured distance saved"}.
            Planar estimate, no perspective correction.</li>
        )}
        <li><strong>Gate points:</strong> {scene.points.map(point => point.source).join(", ") || "not saved"}</li>
      </ul>
      <FileList title={`Rep folder · ${folder}`} files={files} json={json} />
      <FileList title={`Session root · ${sessionRoot}`} files={sessionFiles} json={sessionJson} />
    </section>
  );
}
