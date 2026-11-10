// Reading `yogaLibrary` documents. Yoga library data contract v1 §1.

import { describe, expect, it } from "vitest";
import { normalizeCatalogDrill } from "./drillV2";
import {
  YOGA_LIBRARY_COLLECTION,
  YOGA_LIBRARY_META_DOC,
  isSelectableYogaPose,
  normalizeYogaPose,
  normalizeYogaStatus,
  postureLabel,
} from "./yogaLibrary";

const updatedAt = { seconds: 1_794_000_000, nanoseconds: 0 };

function libraryDoc(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1, drillId: "athlete_boat", name: "Boat", domain: "yoga", status: "published",
    catalogVersion: "1.0.3", createdAt: updatedAt, updatedAt, updatedBy: "system:yoga-library-generator",
    familyId: "boat", equipment: ["mat", "folded blanket"],
    howTo: { setup: "Sit tall with knees bent.", steps: ["Lean back.", "Lift the shins."] },
    validation: { required: false, exemptReason: "yoga-published-before-gate-2026-11-07" },
    futureTopLevel: { kept: "by the store, not by this view" },
    yoga: {
      poseId: "boat", contentRevision: "r1", summary: "Core hold.", exit: "Lower the feet.", isSided: false,
      sideSequence: ["center"], movementInterval: { kind: "hold" }, wristSupport: false, requiresFloor: true,
      posture: "seated", experienceLevel: "intermediate", selectionExclusions: ["pregnancy"],
      sourceCautions: ["low back"], trainingProfile: { focus: "core" },
      legacy: { manifestVersion: "yoga-athlete-1", contentRevision: "r1" },
    },
    ...extra,
  };
}

describe("yogaLibrary decoder", () => {
  it("names its own collection and version document, separate from the drill catalog", () => {
    expect(YOGA_LIBRARY_COLLECTION).toBe("yogaLibrary");
    expect(YOGA_LIBRARY_META_DOC).toBe("yogaLibrary");
  });

  it("decodes the contract's shared and yoga fields", () => {
    const pose = normalizeYogaPose("athlete_boat", libraryDoc({ minimumClient: { build: 41 } }));
    expect(pose).toMatchObject({
      schemaVersion: 1, drillId: "athlete_boat", name: "Boat", domain: "yoga", status: "published",
      catalogVersion: "1.0.3", updatedAt, updatedBy: "system:yoga-library-generator", familyId: "boat",
      equipment: ["mat", "folded blanket"], minimumClient: { build: 41 },
      howTo: { setup: "Sit tall with knees bent.", steps: ["Lean back.", "Lift the shins."] },
      validation: { required: false, exemptReason: "yoga-published-before-gate-2026-11-07" },
      yoga: {
        poseId: "boat", contentRevision: "r1", summary: "Core hold.", exit: "Lower the feet.", isSided: false,
        sideSequence: ["center"], wristSupport: false, requiresFloor: true, posture: "seated",
        experienceLevel: "intermediate", selectionExclusions: ["pregnancy"], sourceCautions: ["low back"],
        legacy: { manifestVersion: "yoga-athlete-1", contentRevision: "r1" },
      },
    });
    expect(isSelectableYogaPose(pose)).toBe(true);
  });

  it("takes drillId from the document id", () => {
    expect(normalizeYogaPose("athlete_boat", libraryDoc({ drillId: "something_else" })).drillId).toBe("athlete_boat");
  });

  it("does NOT treat a yoga document with no status as published", () => {
    const withoutStatus = libraryDoc();
    delete withoutStatus.status;
    const pose = normalizeYogaPose("athlete_boat", withoutStatus);
    expect(pose.status).toBeNull();
    expect(isSelectableYogaPose(pose)).toBe(false);
    // The drill decoder's default is the opposite; the two must not be confused.
    expect(normalizeCatalogDrill("athlete_boat", withoutStatus).status).toBe("published");
  });

  it("treats an unknown or mis-typed status as no status", () => {
    for (const value of ["live", "Published", "", 1, true, null, undefined, {}]) {
      expect(normalizeYogaStatus(value)).toBeNull();
    }
    for (const value of ["draft", "published", "archived"] as const) expect(normalizeYogaStatus(value)).toBe(value);
    expect(isSelectableYogaPose(normalizeYogaPose("x", libraryDoc({ status: "archived" })))).toBe(false);
    expect(isSelectableYogaPose(normalizeYogaPose("x", libraryDoc({ status: "draft" })))).toBe(false);
  });

  it("decodes leniently: a malformed document still yields a row", () => {
    const pose = normalizeYogaPose("odd_pose", { name: 7, equipment: "mat", howTo: "x", yoga: [], minimumClient: { build: "soon" } });
    expect(pose).toMatchObject({
      schemaVersion: 0, drillId: "odd_pose", name: "odd_pose", domain: "yoga", status: null, catalogVersion: "",
      equipment: [], howTo: { setup: "", steps: [] },
      yoga: { poseId: "", contentRevision: "", posture: "", isSided: false, sideSequence: [] },
    });
    expect(pose).not.toHaveProperty("minimumClient");
    expect(pose).not.toHaveProperty("validation");
    expect(pose.yoga).not.toHaveProperty("legacy");
    expect(normalizeYogaPose("empty", undefined).status).toBeNull();
  });

  it("drops an unknown experience level rather than inventing one", () => {
    const pose = normalizeYogaPose("x", libraryDoc({ yoga: { experienceLevel: "expert" } }));
    expect(pose.yoga).not.toHaveProperty("experienceLevel");
  });

  it("humanizes posture tokens", () => {
    expect(postureLabel("seated")).toBe("Seated");
    expect(postureLabel("supineTwist")).toBe("Supine twist");
    expect(postureLabel("all_fours")).toBe("All fours");
    expect(postureLabel("")).toBe("");
  });
});
