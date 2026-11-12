// Yoga library reads and the one admin write: a pose's status.
// Yoga library data contract v1 (program folder CONTRACT.md §1, §4, §5).
//
// `yogaLibrary` is a sibling of `drillCatalog`, never part of it, and it has its
// own version document, `drillCatalogMeta/yogaLibrary`: a yoga change must not
// make installed apps re-download the drill catalog. The status write is the
// drill library's shared status-only transaction, so the staleness rule and the
// validation publish gate are the same code for both collections.

import { db } from "../../../lib/firebase";
import {
  YOGA_LIBRARY_COLLECTION,
  YOGA_LIBRARY_INITIAL_VERSION,
  YOGA_LIBRARY_META_DOC,
  YOGA_LIBRARY_SCHEMA_VERSION,
  normalizeYogaPose,
  normalizeYogaStatus,
} from "../../../lib/contracts/yogaLibrary";
import type { YogaPose } from "../../../lib/contracts/yogaLibrary";
import type { DrillStatus } from "../../../lib/contracts/types";
import { writeStatusOnly } from "./catalog";

export async function loadYogaLibrary(): Promise<YogaPose[]> {
  const snapshot = await db.collection(YOGA_LIBRARY_COLLECTION).get();
  return snapshot.docs.map(doc => normalizeYogaPose(doc.id, doc.data()));
}

export async function loadYogaPose(variantId: string): Promise<YogaPose | null> {
  const doc = await db.collection(YOGA_LIBRARY_COLLECTION).doc(variantId).get();
  return doc.exists ? normalizeYogaPose(doc.id, doc.data()) : null;
}

export async function loadYogaLibraryVersion(): Promise<string> {
  const doc = await db.collection("drillCatalogMeta").doc(YOGA_LIBRARY_META_DOC).get();
  return String(doc.data()?.catalogVersion ?? YOGA_LIBRARY_INITIAL_VERSION);
}

export const STALE_YOGA_MESSAGE = "This pose changed since the list loaded. Reload and make your change again.";

/** Contract §4 `lastChange` is a string: which pose, and the status it moved to. */
export function yogaLastChange(variantId: string, status: DrillStatus): string {
  return `${variantId}: status ${status}`;
}

/**
 * Change only a pose's status, against the state the list loaded. Writes
 * `status`, `catalogVersion`, `updatedAt`, `updatedBy` on the pose and bumps
 * `drillCatalogMeta/yogaLibrary` (absent: from 1.0.0 to 1.0.1) in the same
 * transaction. A document of another schema version is refused.
 */
export function updateYogaPoseStatus(pose: YogaPose, status: DrillStatus): Promise<string> {
  return writeStatusOnly({
    collection: YOGA_LIBRARY_COLLECTION,
    docId: pose.drillId,
    metaDoc: YOGA_LIBRARY_META_DOC,
    status,
    expected: { status: pose.status, catalogVersion: pose.catalogVersion, updatedAt: pose.updatedAt },
    readStatus: normalizeYogaStatus,
    staleMessage: STALE_YOGA_MESSAGE,
    refuse: stored => {
      if (Number(stored.schemaVersion) !== YOGA_LIBRARY_SCHEMA_VERSION) {
        throw new Error(`${pose.drillId} is not a yoga library v${YOGA_LIBRARY_SCHEMA_VERSION} document.`);
      }
    },
    lastChange: () => yogaLastChange(pose.drillId, status),
  });
}
