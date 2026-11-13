// The parent's picker (`/family`, Parent accounts plan §4.5): the children a parent login is linked
// to, read through the login's own `guardians/{uid}` and then each `players/{id}`, the way a legacy
// coach roster loads. Rules remain the authority; this only lists what the parent may open.

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { IdentityDb } from "../../lib/identity";
import type { PlayerGuardians } from "../../lib/guardians";
import type { PlatformTime } from "../../lib/platform-time";

export interface FamilyChild {
  id: string;
  /** Null when the child's profile could not be read; the row still opens the child's view. */
  name: string | null;
  /** Time on platform (plan §4.6), filled after the list shows; null while loading or hidden. */
  platformTime: PlatformTime | null;
}

export function childName(data: Record<string, any> | undefined): string | null {
  const name = [data?.firstName, data?.lastName].filter(value => typeof value === "string" && value.trim()).join(" ").trim();
  return name || (typeof data?.name === "string" && data.name.trim() ? data.name.trim() : null);
}

/** Every listed child, in the record's order. One unreadable child never blanks the list. */
export async function loadFamilyChildren(db: IdentityDb, playerIds: readonly string[]): Promise<FamilyChild[]> {
  return Promise.all(playerIds.map(async id => {
    try {
      const doc = await db.collection("players").doc(id).get();
      return { id, name: doc.exists ? childName(doc.data()) : null, platformTime: null };
    } catch {
      return { id, name: null, platformTime: null };
    }
  }));
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;
export type FamilyPreviewRequest = { parentUid: string; playerId: string };

/**
 * An admin's "Parent view" (§4.8): `/family?previewParent=<uid>&fromPlayer=<playerId>`. Only an
 * admin gets the preview; anyone else gets their own picker, as if the parameters were absent.
 */
export function familyPreviewRequest(search: string, isAdmin: boolean): FamilyPreviewRequest | null {
  if (!isAdmin) return null;
  const params = new URLSearchParams(search);
  const parentUid = params.get("previewParent") || "", playerId = params.get("fromPlayer") || "";
  return parentUid.length > 0 && parentUid.length <= 128 && !/[\s/]/.test(parentUid) && ID.test(playerId) ? { parentUid, playerId } : null;
}

/** The previewed parent's children: its `playerIds` from getPlayerGuardians, or null once unlinked. */
export function previewParent(data: PlayerGuardians, parentUid: string): { email: string | null; playerIds: string[] } | null {
  const guardian = data.guardians.find(entry => entry.uid === parentUid);
  return guardian ? { email: guardian.email, playerIds: guardian.playerIds } : null;
}

/** A parent opens the child's own view; an admin's preview opens the existing staff Player view. */
export function familyChildPath(playerId: string, preview: boolean): string {
  return preview ? `/athlete?player=${encodeURIComponent(playerId)}&workspace=player`
    : `/athlete?player=${encodeURIComponent(playerId)}&userType=player&view=stats`;
}
