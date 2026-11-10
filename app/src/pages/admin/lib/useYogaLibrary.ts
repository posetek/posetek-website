// State for the drill library's Yoga section: the first-open read, the filter,
// and status changes through the shared status-only transaction.

import { useCallback, useEffect, useRef, useState } from "react";
import { postureLabel } from "../../../lib/contracts/yogaLibrary";
import type { YogaPose } from "../../../lib/contracts/yogaLibrary";
import type { DrillStatus } from "../../../lib/contracts/types";
import { SAVED_REFRESH_FAILED_MESSAGE, bumpPatch, commitThenRefresh } from "./catalog";
import { loadYogaLibrary, loadYogaLibraryVersion, loadYogaPose, updateYogaPoseStatus } from "./yogaLibrary";
import { YOGA_PREVIEW_POSES, YOGA_PREVIEW_VERSION } from "./yogaLibraryPreview";

export type YogaLoad =
  | { kind: "idle" }
  | { kind: "ready"; poses: YogaPose[]; version: string }
  | { kind: "error"; message: string };

/** A message shown inside one pose's row: a refused write, or a saved write whose refresh failed. */
export interface RowMessage { drillId: string; kind: "error" | "notice"; text: string }

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

type ReadyLoad = Extract<YogaLoad, { kind: "ready" }>;

/**
 * One status change, as the next section state. Never throws:
 * - a refused or failed write leaves the poses unchanged (the select shows the
 *   stored status again) and returns the error for that row;
 * - a committed write whose re-read failed is still a success: the row takes the
 *   committed status and version, and a notice asks for a reload before the next
 *   change (its `updatedAt` baseline is the old one).
 * The DEV preview writes nothing.
 */
export async function yogaStatusChange(
  load: ReadyLoad,
  pose: YogaPose,
  status: DrillStatus,
  preview = false,
): Promise<{ load: ReadyLoad; message: RowMessage | null }> {
  const committed = (version: string): YogaPose => ({ ...pose, status, catalogVersion: version });
  try {
    const change = await commitThenRefresh<YogaPose>(
      preview ? async () => bumpPatch(load.version) : () => updateYogaPoseStatus(pose, status),
      preview ? async () => null : () => loadYogaPose(pose.drillId),
      committed,
    );
    const next = preview ? committed(change.version) : change.item;
    return {
      load: {
        kind: "ready",
        version: change.version,
        poses: load.poses.flatMap(entry => entry.drillId !== pose.drillId ? [entry] : next ? [next] : []),
      },
      message: change.refreshFailed ? { drillId: pose.drillId, kind: "notice", text: SAVED_REFRESH_FAILED_MESSAGE } : null,
    };
  } catch (writeError) {
    return {
      load,
      message: {
        drillId: pose.drillId,
        kind: "error",
        text: writeError instanceof Error ? writeError.message : "The status could not be saved.",
      },
    };
  }
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
  const [message, setMessage] = useState<RowMessage | null>(null);
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
    setMessage(null);
    const result = await yogaStatusChange(load, pose, status, preview);
    setLoad(result.load);
    setMessage(result.message);
    setBusy(null);
  }, [load, busy, preview]);

  return { load, busy, message, changeStatus };
}
