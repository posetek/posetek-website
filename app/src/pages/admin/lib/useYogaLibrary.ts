// State for the drill library's Yoga section: the first-open read, the filter,
// and status changes through the shared status-only transaction.

import { useCallback, useEffect, useRef, useState } from "react";
import { postureLabel } from "../../../lib/contracts/yogaLibrary";
import type { YogaPose } from "../../../lib/contracts/yogaLibrary";
import type { DrillStatus } from "../../../lib/contracts/types";
import { bumpPatch } from "./catalog";
import { loadYogaLibrary, loadYogaLibraryVersion, loadYogaPose, updateYogaPoseStatus } from "./yogaLibrary";
import { YOGA_PREVIEW_POSES, YOGA_PREVIEW_VERSION } from "./yogaLibraryPreview";

export type YogaLoad =
  | { kind: "idle" }
  | { kind: "ready"; poses: YogaPose[]; version: string }
  | { kind: "error"; message: string };

/** Status filter values: the three statuses, `all`, and `none` for a document with no valid status. */
export interface YogaFilter { search: string; posture: string; status: string }

export function filterYogaPoses(poses: YogaPose[], filter: YogaFilter): YogaPose[] {
  const term = filter.search.trim().toLowerCase();
  return poses
    .filter(pose => filter.posture === "all" || pose.yoga.posture === filter.posture)
    .filter(pose => filter.status === "all" || (pose.status ?? "none") === filter.status)
    .filter(pose => !term || pose.name.toLowerCase().includes(term) || pose.drillId.toLowerCase().includes(term))
    .sort((a, b) => postureLabel(a.yoga.posture).localeCompare(postureLabel(b.yoga.posture)) || a.name.localeCompare(b.name));
}

/**
 * Reads `yogaLibrary` the first time the section opens (`idle` until then and
 * while the read is in flight). The DEV preview uses synthetic poses and writes
 * nothing.
 */
export function useYogaLibrary(active: boolean, preview: boolean) {
  const [load, setLoad] = useState<YogaLoad>(() =>
    preview ? { kind: "ready", poses: YOGA_PREVIEW_POSES, version: YOGA_PREVIEW_VERSION } : { kind: "idle" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (!active || preview || requested.current) return;
    requested.current = true;
    Promise.all([loadYogaLibrary(), loadYogaLibraryVersion()])
      .then(([poses, version]) => setLoad({ kind: "ready", poses, version }))
      .catch(loadError => setLoad({ kind: "error", message: loadError?.message || "The yoga library could not be loaded." }));
  }, [active, preview]);

  const changeStatus = useCallback(async (pose: YogaPose, status: DrillStatus) => {
    if (load.kind !== "ready" || busy) return;
    setBusy(pose.drillId);
    setError(null);
    try {
      let version: string;
      let fresh: YogaPose | null;
      if (preview) {
        version = bumpPatch(load.version);
        fresh = { ...pose, status, catalogVersion: version };
      } else {
        version = await updateYogaPoseStatus(pose, status);
        // Re-read: the server stamped `updatedAt`, which is the next change's baseline.
        fresh = await loadYogaPose(pose.drillId);
      }
      setLoad(current => current.kind !== "ready" ? current : {
        kind: "ready",
        version,
        poses: current.poses.flatMap(entry => entry.drillId !== pose.drillId ? [entry] : fresh ? [fresh] : []),
      });
    } catch (writeError) {
      setError(`${pose.name}: ${writeError instanceof Error ? writeError.message : "The status could not be saved."}`);
    } finally {
      setBusy(null);
    }
  }, [load, busy, preview]);

  return { load, busy, error, changeStatus };
}
