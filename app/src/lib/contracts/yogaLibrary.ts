// Reading `yogaLibrary/{variantId}` documents into one view model.
//
// Yoga library data contract v1 (program folder CONTRACT.md §1, §4): one mutable
// document per pose in a sibling collection of `drillCatalog`, with the drill
// catalog's shared field names and meanings and the yoga-only fields under `yoga`.
//
// Two rules differ from `normalizeCatalogDrill` on purpose:
//   - `status` is always explicit. A document with no valid status is NOT
//     published: it decodes to `status: null`, and nothing selects it.
//   - Yoga never enters `drillCatalog`, so this decoder and the drill decoder never
//     read each other's collection.
//
// The website writes only `status` (and its stamps) on these documents; the
// view model is for display, so a lenient read is enough. Unknown keys are not
// kept here because no writer here sends them back.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { normalizeCatalogValidation } from "./drillV2";
import type { CatalogValidation } from "./drillV2";
import { DRILL_STATUSES } from "./types";
import type { CatalogMedia, DrillStatus } from "./types";

export const YOGA_LIBRARY_COLLECTION = "yogaLibrary";
/** The yoga library's own version document, `drillCatalogMeta/yogaLibrary` (contract §4). */
export const YOGA_LIBRARY_META_DOC = "yogaLibrary";
export const YOGA_LIBRARY_SCHEMA_VERSION = 1;
/** Contract §4: the version starts here; the first write makes it `1.0.1`. */
export const YOGA_LIBRARY_INITIAL_VERSION = "1.0.0";

export type YogaExperienceLevel = "beginner" | "intermediate" | "advanced";

export interface YogaPoseFields {
  poseId: string;
  contentRevision: string;
  summary?: string;
  exit: string;
  isSided: boolean;
  sideSequence: string[];
  wristSupport: boolean;
  requiresFloor: boolean;
  posture: string;
  experienceLevel?: YogaExperienceLevel;
  selectionExclusions: string[];
  sourceCautions: string[];
  legacy?: { manifestVersion: string; contentRevision: string };
}

export interface YogaPose {
  schemaVersion: number;
  drillId: string;
  name: string;
  domain: string;
  /** null when the document has no valid status. Never treated as published. */
  status: DrillStatus | null;
  catalogVersion: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy?: unknown;
  familyId: string;
  equipment: string[];
  howTo: { setup: string; steps: string[] };
  minimumClient?: { build: number };
  validation?: CatalogValidation;
  media?: CatalogMedia;
  yoga: YogaPoseFields;
}

/** An explicit `draft`, `published` or `archived`; anything else (including absent) is null. */
export function normalizeYogaStatus(value: unknown): DrillStatus | null {
  return typeof value === "string" && (DRILL_STATUSES as readonly string[]).includes(value)
    ? (value as DrillStatus)
    : null;
}

export function isSelectableYogaPose(pose: Pick<YogaPose, "status">): boolean {
  return pose.status === "published";
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(entry => String(entry)) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function intOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function experienceLevel(value: unknown): YogaExperienceLevel | undefined {
  return value === "beginner" || value === "intermediate" || value === "advanced" ? value : undefined;
}

/** One view model for a `yogaLibrary/{id}` document. `id` is authoritative for `drillId`. */
export function normalizeYogaPose(id: string, raw: any): YogaPose {
  const source = record(raw);
  const yoga = record(source.yoga);
  const howTo = record(source.howTo);
  const legacy = record(yoga.legacy);
  const minimumBuild = Number(record(source.minimumClient).build);
  const validation = normalizeCatalogValidation(source.validation);

  return {
    schemaVersion: intOr(source.schemaVersion, 0),
    drillId: id,
    name: text(source.name) || id,
    domain: text(source.domain) || "yoga",
    status: normalizeYogaStatus(source.status),
    catalogVersion: text(source.catalogVersion),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    updatedBy: source.updatedBy,
    familyId: text(source.familyId),
    equipment: stringList(source.equipment),
    howTo: { setup: text(howTo.setup), steps: stringList(howTo.steps) },
    ...(Number.isInteger(minimumBuild) ? { minimumClient: { build: minimumBuild } } : {}),
    ...(validation ? { validation } : {}),
    ...(source.media && typeof source.media === "object" ? { media: source.media as CatalogMedia } : {}),
    yoga: {
      poseId: text(yoga.poseId),
      contentRevision: text(yoga.contentRevision),
      ...(typeof yoga.summary === "string" ? { summary: yoga.summary } : {}),
      exit: text(yoga.exit),
      isSided: yoga.isSided === true,
      sideSequence: stringList(yoga.sideSequence),
      wristSupport: yoga.wristSupport === true,
      requiresFloor: yoga.requiresFloor === true,
      posture: text(yoga.posture),
      ...(experienceLevel(yoga.experienceLevel) ? { experienceLevel: experienceLevel(yoga.experienceLevel) } : {}),
      selectionExclusions: stringList(yoga.selectionExclusions),
      sourceCautions: stringList(yoga.sourceCautions),
      ...(typeof legacy.manifestVersion === "string"
        ? { legacy: { manifestVersion: legacy.manifestVersion, contentRevision: text(legacy.contentRevision) } }
        : {}),
    },
  };
}

/** "Standing", "Seated", … for a stored posture token such as `standing` or `supineTwist`. */
export function postureLabel(posture: string): string {
  if (!posture) return "";
  return posture
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase()
    .replace(/^./, character => character.toUpperCase());
}
