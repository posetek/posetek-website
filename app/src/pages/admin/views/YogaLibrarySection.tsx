// The drill library's Yoga section: every `yogaLibrary` pose, searchable and
// filterable like the drills, each with the shared status select. A status
// change is the only write (status-only transaction, yoga version bump).
// Full yoga editing is a later slice, so rows do not open a detail page.

import { useMemo, useState } from "react";
import { postureLabel } from "../../../lib/contracts/yogaLibrary";
import type { YogaPose } from "../../../lib/contracts/yogaLibrary";
import type { DrillStatus } from "../../../lib/contracts/types";
import { filterYogaPoses } from "../lib/useYogaLibrary";
import type { YogaFilter, YogaLoad } from "../lib/useYogaLibrary";
import { StatusField } from "./StatusField";

const NO_POSES: YogaPose[] = [];

export default function YogaLibrarySection({ load, busy, error, onStatus }: {
  load: YogaLoad;
  busy: string | null;
  error: string | null;
  onStatus: (pose: YogaPose, status: DrillStatus) => void;
}) {
  const [filter, setFilter] = useState<YogaFilter>({ search: "", posture: "all", status: "all" });
  const poses = load.kind === "ready" ? load.poses : NO_POSES;
  const postures = useMemo(() => {
    const map = new Map<string, number>();
    for (const pose of poses) map.set(pose.yoga.posture, (map.get(pose.yoga.posture) ?? 0) + 1);
    return [...map.entries()].sort(([a], [b]) => postureLabel(a).localeCompare(postureLabel(b)));
  }, [poses]);
  const unset = poses.filter(pose => pose.status === null).length;
  const shown = useMemo(() => filterYogaPoses(poses, filter), [poses, filter]);
  const set = (key: keyof YogaFilter) => (value: string) => setFilter(current => ({ ...current, [key]: value }));

  return (
    <>
      <div className="admin-toolbar training-library-toolbar">
        <label className="search-field">
          <span className="material-symbols-outlined">search</span>
          <input type="search" placeholder="Search poses by name or id" autoComplete="off"
                 value={filter.search} onChange={event => set("search")(event.target.value)} />
        </label>
        <label>
          <span className="material-symbols-outlined" aria-hidden="true">category</span>
          <select value={filter.posture} onChange={event => set("posture")(event.target.value)} aria-label="Filter by posture">
            <option value="all">All postures</option>
            {postures.map(([posture, count]) => (
              <option key={posture} value={posture}>{postureLabel(posture) || "—"} ({count})</option>
            ))}
          </select>
        </label>
        <select value={filter.status} onChange={event => set("status")(event.target.value)} aria-label="Filter by status">
          <option value="all">Any status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
          {unset > 0 && <option value="none">No status ({unset})</option>}
        </select>
      </div>

      {load.kind === "idle" && <div className="portal-loading"><span className="spinner" /><p>Loading the yoga library…</p></div>}
      {load.kind === "error" && <p className="form-message" role="alert">{load.message}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}

      {load.kind === "ready" && <YogaPoseRows poses={shown} busy={busy} onStatus={onStatus} />}
    </>
  );
}

export function YogaPoseRows({ poses, busy, onStatus }: {
  poses: YogaPose[];
  busy: string | null;
  onStatus: (pose: YogaPose, status: DrillStatus) => void;
}) {
  return (
    <div className="admin-rows">
      {poses.length === 0 && <p className="admin-empty">No poses match that search.</p>}
      {poses.map(pose => (
        <div key={pose.drillId} className="admin-row training-library-row" data-status={pose.status ?? "none"}>
          <div className="admin-row-copy">
            <strong>{pose.name}</strong>
            <span className="admin-row-meta">
              {pose.yoga.posture && <span className="admin-chip accent">{postureLabel(pose.yoga.posture)}</span>}
              <span className="admin-chip">{pose.drillId}</span>
            </span>
          </div>
          <div className="admin-row-actions">
            <StatusField compact value={pose.status} loadedStatus={pose.status} validation={pose.validation}
                         managed={false} disabled={busy !== null} onChange={status => onStatus(pose, status)} />
          </div>
        </div>
      ))}
    </div>
  );
}
