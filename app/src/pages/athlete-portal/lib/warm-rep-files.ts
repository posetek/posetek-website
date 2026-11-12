/* eslint-disable @typescript-eslint/no-explicit-any */
// Background warm-up of the rep-file cache (replay-cache.ts): the files a replay opens, loaded before
// anyone asks, so picking a Stats card shows its replay at once.

import { storage } from "../../../lib/firebase";
import { poseReplayUsable, TRACKING_ARTIFACT, TRACKING_DRILLS } from "../../../lib/replay-tracking";
import type { Drill } from "./drills";
import { authArtifacts, fetchJson, type Access } from "./loaders";
import { artifactFolder } from "./metrics";

export interface WarmItem {
  drill: Drill;
  rep: any;
  playerId: string;
  /** The viewer's access. Staff also warm a box replay the media answer leaves out (as the viewer reads it). */
  access?: Access;
}

const STAFF: Access[] = ["admin", "manager", "coach"];
const frameCount = (pose: any) => Array.isArray(pose) ? pose.length : Array.isArray(pose?.frames) ? pose.frames.length : 0;

/** The same files `loadRepReplay` reads for one rep, into the cache. */
async function warmOne({ drill, rep, playerId, access }: WarmItem): Promise<void> {
  const payload = await authArtifacts(drill, rep, playerId);
  const urls: Record<string, string> = { ...(payload.artifactUrls || {}) };
  const [pose, metadata] = await Promise.all([
    fetchJson(urls["pose.json"]).catch(() => null),
    fetchJson(urls["metadata.json"]).catch(() => null),
  ]);
  if (!TRACKING_DRILLS.has(drill.key) || poseReplayUsable(frameCount(pose), metadata || {})) return;
  let tracking = urls[TRACKING_ARTIFACT];
  if (!tracking && !urls["pose.json"] && access && STAFF.includes(access)) {
    try { tracking = await storage.ref(artifactFolder(rep, drill, playerId)).child(TRACKING_ARTIFACT).getDownloadURL(); }
    catch { /* Not stored, or this viewer may not read the folder. */ }
  }
  await fetchJson(tracking).catch(() => null);
}

const idle = () => new Promise<void>(resolve => {
  const request = (globalThis as any).requestIdleCallback as ((callback: () => void, options?: { timeout: number }) => void) | undefined;
  if (request) request(() => resolve(), { timeout: 1500 });
  else setTimeout(resolve, 0);
});

/**
 * Loads the given reps' files in the background, `concurrency` at a time (default 2), after the
 * browser is idle so the first paint is not held up. Never rejects: a rep that fails is skipped and
 * loads again when it is opened. Calling it again with the same reps reuses what is kept or loading.
 */
export async function warmRepFiles(items: (WarmItem | null | undefined)[], { concurrency = 2 }: { concurrency?: number } = {}): Promise<void> {
  const queue = items.filter((item): item is WarmItem => !!item?.drill && !!item.rep && !!item.playerId);
  if (!queue.length) return;
  await idle();
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) await warmOne(item).catch(() => { /* opened later instead */ });
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));
}
