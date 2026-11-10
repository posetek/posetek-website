// Illustrative `yogaLibrary` documents for the DEV-only admin preview
// (`/admin/drills?section=yoga&preview=1`). Synthetic: no real catalog content.

import { normalizeYogaPose } from "../../../lib/contracts/yogaLibrary";
import type { YogaPose } from "../../../lib/contracts/yogaLibrary";

const stamp = { seconds: 1_794_000_000, nanoseconds: 0 };

function pose(id: string, name: string, posture: string, status: string | undefined, isSided = false): YogaPose {
  return normalizeYogaPose(id, {
    schemaVersion: 1, drillId: id, name, domain: "yoga", status, catalogVersion: "1.0.0",
    updatedAt: stamp, updatedBy: "system:preview", familyId: `${id}-family`, equipment: ["mat"],
    howTo: { setup: "Synthetic preview setup.", steps: ["Synthetic preview step."] },
    validation: { required: false, exemptReason: "yoga-published-before-gate-2026-11-07" },
    yoga: {
      poseId: id, contentRevision: "r1", exit: "Synthetic preview exit.", isSided,
      sideSequence: isSided ? ["left", "right"] : ["center"], wristSupport: false, requiresFloor: true,
      posture, selectionExclusions: [], sourceCautions: [],
    },
  });
}

export const YOGA_PREVIEW_VERSION = "1.0.0";

export const YOGA_PREVIEW_POSES: YogaPose[] = [
  pose("preview_mountain", "Mountain", "standing", "published"),
  pose("preview_low_lunge", "Low lunge", "kneeling", "published", true),
  pose("preview_boat", "Boat", "seated", "archived"),
  pose("preview_bridge", "Bridge", "supine", "draft"),
  pose("preview_child", "Child's pose", "kneeling", undefined),
];
