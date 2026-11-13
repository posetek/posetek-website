// The parent's picker (`/family`, Parent accounts plan §4.5): the children a parent login is linked
// to, read through the login's own `guardians/{uid}` and then each `players/{id}`, the way a legacy
// coach roster loads. Rules remain the authority; this only lists what the parent may open.

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { IdentityDb } from "../../lib/identity";

/**
 * Time on platform for one child (`getAthletePlatformTime`, plan §4.6 and §11.3). The later W4 slice
 * fills it; until then every row carries `null` and nothing is shown.
 */
export interface PlatformTime {
  totalMinutes: number | null;
  status: "available" | "partial" | "unavailable";
  collectionStartedAtMillis: number | null;
}

export interface FamilyChild {
  id: string;
  /** Null when the child's profile could not be read; the row still opens the child's view. */
  name: string | null;
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
