// Result validation: the pure core behind /admin/result-validation.
//
// A recorded result is shown whether or not anyone has validated it. When an
// admin validates, adjusts or rejects one, the decision is saved as an
// ordinary admin revision through `adminReviseRep`, so the revision becomes
// the source of truth the way Insights already reads it
// (insights-v2-qualification.js → reason "acceptedRevision"): the revision's
// fields carry the drill's primary metric, and metadata.json is marked
// `resultsValid: true`, `processingStatus: "complete"`, `failedSteps: []`.
//
// Nothing the phone produced is discarded. The callable keeps the previous rep
// document and metadata.json under the revision, pose.json and the drill's own
// artifacts are never rewritten, and the human labels (validation decision,
// foot positions, tracks) are written to admin_annotations.json together with
// every earlier annotation set, so the original model output and each human
// correction stay available as training data.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { num, int } from "./repTools";
import type { Point } from "./repTools";

export type ValidationDecision = "validated" | "adjusted" | "rejected";
export type ValidationState = ValidationDecision | "revised" | "open";

/** The field Insights qualifies each drill by (insights-v2-qualification.js SPECS). */
export const PRIMARY_METRIC: Record<string, { key: string; label: string }> = {
  shooting: { key: "velocity", label: "Ball velocity" },
  sprint: { key: "max_velocity", label: "Top speed" },
  jump: { key: "jumpHeight", label: "Jump height" },
  broadJump: { key: "broadJumpDistance", label: "Distance" },
  changeOfDirection: { key: "totalTime", label: "Total time" },
  dribbling: { key: "totalTime", label: "Total time" },
};

export const primaryMetricKey = (drillKey: string): string | null => PRIMARY_METRIC[drillKey]?.key ?? null;

/** The primary result, in stored units, the way Insights reads it: positive and finite, else null. */
export function primaryMetricValue(drillKey: string, record: Record<string, any> | null | undefined): number | null {
  if (!record) return null;
  const positive = (value: unknown) => {
    const parsed = typeof value === "number" && Number.isFinite(value) ? value : null;
    return parsed !== null && parsed > 0 ? parsed : null;
  };
  if (drillKey === "sprint") return positive(record.max_velocity) ?? positive(record.maxVelocity);
  if (drillKey === "jump") {
    const meters = positive(record.jumpHeight) ?? positive(record.jump_height_m);
    if (meters !== null) return meters;
    const inches = positive(record.jump_height_in) ?? positive(record.jump_height_inches);
    return inches === null ? null : inches * 0.0254;
  }
  const key = primaryMetricKey(drillKey);
  return key ? positive(record[key]) : null;
}

/** True when the phone itself flagged the rep: invalid, partial, or with failed steps. */
export function processingFlagged(rep: Record<string, any> | null | undefined): boolean {
  if (!rep) return false;
  if (Object.hasOwn(rep, "resultsValid") && rep.resultsValid !== true) return true;
  if (Object.hasOwn(rep, "processingStatus") && rep.processingStatus !== "complete") return true;
  return Array.isArray(rep.failedSteps) && rep.failedSteps.length > 0;
}

const NOTE_PREFIX: Record<ValidationDecision, string> = { validated: "Validated", adjusted: "Adjusted", rejected: "Rejected" };

/** The revision note: a fixed decision prefix (which the queue reads back) plus the admin's words. */
export function validationNote(decision: ValidationDecision, note: string): string {
  const text = note.trim();
  return `${NOTE_PREFIX[decision]}${text ? ` · ${text}` : ""}`.slice(0, 2000);
}

export interface ValidationStatus {
  state: ValidationState;
  byEmail: string | null;
  atMillis: number | null;
  note: string | null;
}

/**
 * Where a rep stands, from the provenance the callable writes onto the rep
 * document. Revisions saved by this tool start with their decision; any other
 * revision (the per-rep tools) is "revised".
 */
export function validationStatus(rep: Record<string, any> | null | undefined): ValidationStatus {
  const revision = rep?.adminRevision;
  if (!revision?.revisionId) return { state: "open", byEmail: null, atMillis: null, note: null };
  const note = typeof revision.note === "string" ? revision.note : null;
  const match = note?.match(/^(Validated|Adjusted|Rejected)\b/);
  const state: ValidationState = match ? (match[1].toLowerCase() as ValidationDecision) : "revised";
  return { state, byEmail: typeof revision.byEmail === "string" ? revision.byEmail : null, atMillis: num(revision.atMillis), note };
}

export interface ValidationRevision {
  fields: Record<string, number | string | null>;
  metadataExtras: Record<string, any>;
  note: string;
}

/**
 * What a decision writes, on top of the fields the rep tools assembled.
 *
 * - validated: the recorded primary result, unchanged, plus the valid flags.
 * - adjusted: every changed field plus the (new) primary result and the valid flags.
 * - rejected: no field changes; metadata.json is marked invalid so the result
 *   stops qualifying, while every recorded value stays on the rep and in the
 *   revision snapshot.
 */
export function validationRevision(input: {
  drillKey: string;
  decision: ValidationDecision;
  original: Record<string, any>;
  after: Record<string, any>;
  changedFields: Record<string, number | string | null>;
  note: string;
}): ValidationRevision | { error: string } {
  const { drillKey, decision, original, after, changedFields, note } = input;
  const key = primaryMetricKey(drillKey);
  const label = PRIMARY_METRIC[drillKey]?.label ?? "result";
  if (!key) return { error: "This drill has no result to validate." };
  if (decision === "rejected") {
    return {
      fields: {},
      metadataExtras: { resultsValid: false, processingStatus: "partial", failedSteps: ["admin.rejected"] },
      note: validationNote(decision, note),
    };
  }
  const valid = { resultsValid: true, processingStatus: "complete", failedSteps: [] as string[] };
  if (decision === "validated") {
    const value = primaryMetricValue(drillKey, original);
    if (value === null) return { error: `There is no recorded ${label.toLowerCase()} to validate. Adjust it, or reject the rep.` };
    return { fields: { [key]: value }, metadataExtras: valid, note: validationNote(decision, note) };
  }
  const value = primaryMetricValue(drillKey, after);
  if (value === null) return { error: `The adjusted rep needs a positive ${label.toLowerCase()}. Reject the rep if it has no usable result.` };
  return { fields: { ...changedFields, [key]: value }, metadataExtras: valid, note: validationNote(decision, note) };
}

// MARK: - Annotation history (human labels are never overwritten)

export const MAX_ANNOTATION_HISTORY_BYTES = 2_500_000;

/**
 * admin_annotations.json is replaced on every revision, so the previous file
 * is carried along inside the new one. The oldest entries are dropped only if
 * the history would exceed the size budget (the callable accepts 4 MB).
 */
export function withAnnotationHistory(next: Record<string, any>, previous: any): Record<string, any> {
  if (!previous || typeof previous !== "object" || Array.isArray(previous)) return { ...next, annotationHistory: [] };
  const { annotationHistory: prior, ...previousEntry } = previous as Record<string, any>;
  const history = [...(Array.isArray(prior) ? prior : []), previousEntry];
  while (history.length && new TextEncoder().encode(JSON.stringify(history)).length > MAX_ANNOTATION_HISTORY_BYTES) history.shift();
  return { ...next, annotationHistory: history };
}

// MARK: - Broad jump: start and landing foot

/** BroadJumpProcessingMath.maxDistanceMeters. */
export const BROAD_JUMP_MAX_DISTANCE_METERS = 4;

export interface FootMark { frame: number | null; x: number; y: number }
export interface BroadJumpFeet { start: FootMark | null; landing: FootMark | null }

export interface BroadJumpEvidence {
  fit: any;
  footCenters: any;
  comMidpoints: any;
}

export function parsePointSeries(value: unknown): (Point | null)[] {
  if (!Array.isArray(value)) return [];
  return value.map(entry => {
    const x = Array.isArray(entry) ? num(entry[0]) : num((entry as any)?.x);
    const y = Array.isArray(entry) ? num(entry[1]) : num((entry as any)?.y);
    return x !== null && y !== null ? { x, y } : null;
  });
}

const unit = (value: number | null) => (value !== null && value >= 0 && value <= 1 ? value : null);

/**
 * The feet the phone measured from: foot_piecewise_fit.json's start/end foot x
 * at the takeoff and landing frames, with the foot center's height there (else
 * the ground line). Null where the phone did not write them.
 */
export function phoneBroadJumpFeet(evidence: BroadJumpEvidence | null, metadata: any): BroadJumpFeet {
  const fit = evidence?.fit ?? {};
  const centers = parsePointSeries(evidence?.footCenters);
  const ground = unit(num(metadata?.ground_loc_y));
  const at = (xKey: string, frameKeys: string[]): FootMark | null => {
    const x = unit(num(fit[xKey]));
    if (x === null) return null;
    const frame = frameKeys.map(key => int(fit[key])).find(value => value !== null) ?? null;
    const y = (frame !== null ? centers[frame]?.y : null) ?? ground ?? 0.9;
    return { frame, x, y };
  };
  return {
    start: at("startFootXNorm", ["takeoffFrameIndex", "takeoffFrame"]),
    landing: at("endFootXNorm", ["landingFrameIndex", "landingFrame"]),
  };
}

/** Feet saved by an earlier validation win over the phone's. */
export function initialBroadJumpFeet(adminAnnotations: any, phone: BroadJumpFeet): BroadJumpFeet {
  const saved = adminAnnotations?.broadJump;
  const read = (value: any): FootMark | null => {
    const x = unit(num(value?.x)), y = unit(num(value?.y));
    return x === null || y === null ? null : { frame: int(value?.frame), x, y };
  };
  return { start: read(saved?.startFoot) ?? phone.start, landing: read(saved?.landingFoot) ?? phone.landing };
}

/** The scale the phone measured with: metadata's m_to_normalized_units (meters per normalized x). */
export function broadJumpScale(metadata: any): number | null {
  const value = num(metadata?.m_to_normalized_units);
  return value !== null && value > 0 ? value : null;
}

/** BroadJumpProcessingMath.jumpDistanceMeters: |end x − start x| × meters per unit. */
export function broadJumpDistance(feet: BroadJumpFeet, metersPerUnit: number | null): number | null {
  if (!feet.start || !feet.landing || metersPerUnit === null) return null;
  return Math.abs(feet.landing.x - feet.start.x) * metersPerUnit;
}

export function feetMoved(a: BroadJumpFeet, b: BroadJumpFeet): boolean {
  const same = (p: FootMark | null, q: FootMark | null) => (!p && !q) || Boolean(p && q && Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9);
  return !same(a.start, b.start) || !same(a.landing, b.landing);
}

// MARK: - Display

export function metersToFeetText(meters: number | null): string {
  if (meters === null) return "—";
  const tenths = Math.round(meters * 393.7007874);
  const feet = Math.floor(tenths / 120);
  return `${feet}′ ${((tenths - feet * 120) / 10).toFixed(1)}″`;
}

/** The primary result in the units coaches read: ft/in, in, mph, s. */
export function primaryResultText(drillKey: string, value: number | null): string {
  if (value === null) return "No result";
  if (drillKey === "broadJump") return `${metersToFeetText(value)} (${value.toFixed(2)} m)`;
  if (drillKey === "jump") return `${(value * 39.37007874).toFixed(1)} in`;
  if (drillKey === "sprint" || drillKey === "shooting") return `${(value * 2.23694).toFixed(1)} mph`;
  return `${value.toFixed(2)} s`;
}
