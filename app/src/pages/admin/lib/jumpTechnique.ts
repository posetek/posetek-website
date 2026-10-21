export const JUMP_PHASES = ["Coil", "Mid-extension", "Takeoff", "Peak"] as const;
export const JUMP_ANGLE_FIELDS = ["coilKeyAngles", "midExtensionAngles", "takeoffAngles", "peakHeightAngles"] as const;
export const JUMP_ARTIFACTS = ["key_frames.json", "filtered_average_2d_positions.json", "chest_offsets.json", "velocity.json", "acceleration.json", "grf.json"] as const;
export type JumpSources = Record<string, unknown>;
export function jumpFrames(value: unknown): number[] | null {
  return Array.isArray(value) && value.length === 4 && value.every((f, i) => Number.isInteger(f) && f >= 0 && (i === 0 || f > value[i - 1])) ? value : null;
}
export function previewJumpTechnique(frames: number[], source: JumpSources, originalHeight: number | null) {
  const old = jumpFrames(source["key_frames.json"]);
  const positions = source["filtered_average_2d_positions.json"];
  if (!jumpFrames(frames) || !old) throw new Error("Choose four frames in order: coil, mid-extension, takeoff, peak.");
  if (!Array.isArray(positions) || frames[3] >= positions.length) throw new Error("Selected frames are outside the saved joint positions.");
  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1]];
  const neg = (a: number[]) => [-a[0], -a[1]];
  const angle = (a: number[], b: number[]) => {
    const norm = Math.hypot(...a) * Math.hypot(...b);
    if (!Number.isFinite(norm) || !(norm > 1e-12)) throw new Error("A selected frame has an unusable joint segment. Choose a clear frame.");
    return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / norm))) * 180 / Math.PI;
  };
  const angles = frames.map(frame => {
    const points = positions[frame];
    if (!Array.isArray(points) || points.length !== 6 || points.some(p => !Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite))) throw new Error("A selected frame is missing joint positions. Choose a clear frame.");
    const [ankle, knee, hip, shoulder, elbow, wrist] = points as number[][];
    const shank = sub(knee, ankle), thigh = sub(hip, knee), trunk = sub(shoulder, hip), arm = sub(elbow, shoulder), forearm = sub(wrist, elbow);
    return [angle(shank, [1, 0]), angle(thigh, neg(shank)), angle(trunk, neg(thigh)), angle(trunk, arm), angle(neg(arm), forearm)];
  });
  const oldStart = Math.max(0, old[0] - 100), start = Math.max(0, frames[0] - 100);
  for (const name of ["velocity.json", "acceleration.json", "grf.json"]) {
    const values = source[name];
    if (values != null && (!Array.isArray(values) || values.length !== old[2] - oldStart + 1 || start < oldStart || frames[2] > old[2])) throw new Error("These frames need motion samples outside the saved chart range. Reprocess the original recording first.");
  }
  let height = originalHeight;
  if (frames[3] !== old[3]) {
    const offsets = source["chest_offsets.json"];
    const offset = Array.isArray(offsets) ? offsets[frames[3]] : null;
    if (!Array.isArray(offset) || !Number.isFinite(offset[1]) || Math.abs(offset[1]) > 1) throw new Error("No valid chest displacement is saved at this peak.");
    height = Math.abs(offset[1]);
  }
  return { angles, height, changed: frames.some((frame, i) => frame !== old[i]) };
}
