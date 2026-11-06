// Reads behind /admin/result-validation. Admins may read testing sessions,
// their participants and every player's reps directly (firestore.rules:
// testingEvents/** and players/{pid}/reps read for isPosetekAdmin()); every
// write goes through the rep tools' `adminReviseRep` callable.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { db } from "../../../lib/firebase";
import { DRILLS } from "../../athlete-portal/lib/drills";
import { normalizeRep, repNumber, sessionNumber } from "../../athlete-portal/lib/metrics";
import { primaryMetricValue, processingFlagged, validationStatus } from "./resultValidation";
import type { ValidationStatus } from "./resultValidation";
import type { PlayerProfile } from "./ageCurve";

export interface TestingSessionRow {
  id: string;
  name: string;
  status: string;
  participantCount: number;
  createdAtMillis: number | null;
  teamIds: string[];
}

export interface ValidationQueueRow {
  key: string;
  playerId: string;
  playerName: string;
  rosterOrder: number;
  repId: string;
  drillKey: string;
  drillLabel: string;
  sessionNumber: number;
  repNumber: number;
  createdAtMillis: number;
  value: number | null;
  flagged: boolean;
  status: ValidationStatus;
}

export interface ValidationQueue {
  eventId: string;
  rows: ValidationQueueRow[];
  /** Participants whose reps could not be read; the queue is incomplete without them. */
  failedPlayers: string[];
}

const millisOf = (value: any): number | null => {
  const result = typeof value === "number" ? value : value?.toMillis?.() ?? null;
  return Number.isFinite(result) ? result : null;
};

export async function listTestingSessions(limit = 60): Promise<TestingSessionRow[]> {
  const snapshot = await db.collection("testingEvents").orderBy("createdAtMillis", "desc").limit(limit).get();
  return snapshot.docs.map(doc => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Testing session",
      status: typeof data.status === "string" ? data.status : "unknown",
      participantCount: Number.isFinite(data.participantCount) ? data.participantCount : 0,
      createdAtMillis: millisOf(data.createdAtMillis) ?? millisOf(data.createdAt),
      teamIds: Array.isArray(data.teamIds) ? data.teamIds.filter((id: unknown) => typeof id === "string") : [],
    };
  });
}

export function drillKeyOfRep(rep: any): string | null {
  const type = rep?.repType || rep?.drillType;
  return DRILLS.find(drill => drill.types.includes(type))?.key ?? null;
}

export function queueRow(rep: any, player: { id: string; name: string; rosterOrder: number }): ValidationQueueRow | null {
  const drillKey = drillKeyOfRep(rep);
  if (!drillKey || drillKey === "freeRecord") return null;
  const drill = DRILLS.find(item => item.key === drillKey)!;
  return {
    key: `${player.id}/${rep.id}`,
    playerId: player.id,
    playerName: player.name,
    rosterOrder: player.rosterOrder,
    repId: rep.id,
    drillKey,
    drillLabel: drill.label,
    sessionNumber: sessionNumber(rep),
    repNumber: repNumber(rep),
    createdAtMillis: rep.createdAtMillis || 0,
    value: primaryMetricValue(drillKey, rep),
    flagged: processingFlagged(rep),
    status: validationStatus(rep),
  };
}

/** Roster order, then drill order, then session and rep: the order the station recorded them. */
export function sortQueue(rows: ValidationQueueRow[]): ValidationQueueRow[] {
  const drillOrder = (key: string) => DRILLS.findIndex(drill => drill.key === key);
  return [...rows].sort((a, b) => a.rosterOrder - b.rosterOrder || a.playerName.localeCompare(b.playerName)
    || drillOrder(a.drillKey) - drillOrder(b.drillKey) || a.sessionNumber - b.sessionNumber || a.repNumber - b.repNumber
    || a.createdAtMillis - b.createdAtMillis);
}

async function mapLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  }));
  return results;
}

export async function loadValidationQueue(eventId: string): Promise<ValidationQueue> {
  const participants = await db.collection("testingEvents").doc(eventId).collection("participants").get();
  const players = participants.docs.map((doc, index) => {
    const data = doc.data() || {};
    return {
      id: typeof data.playerDocId === "string" && data.playerDocId ? data.playerDocId : doc.id,
      name: typeof data.displayName === "string" && data.displayName.trim() ? data.displayName.trim() : "Athlete",
      rosterOrder: Number.isFinite(data.rosterOrder) ? data.rosterOrder : index,
    };
  });
  const failedPlayers: string[] = [];
  const perPlayer = await mapLimited(players, 6, async player => {
    try {
      const reps = await db.collection("players").doc(player.id).collection("reps").where("testingEventId", "==", eventId).get();
      return reps.docs.map(doc => queueRow(normalizeRep(doc), player)).filter((row): row is ValidationQueueRow => row !== null);
    } catch (error) {
      console.warn("[result validation] reps unavailable", player.id, error);
      failedPlayers.push(player.name);
      return [];
    }
  });
  return { eventId, rows: sortQueue(perPlayer.flat()), failedPlayers };
}

/** Age and gender fields for the age curve: birthDate / dateOfBirth / age / gender from each player document. */
export async function loadPlayerProfiles(playerIds: string[]): Promise<Record<string, PlayerProfile>> {
  const unique = [...new Set(playerIds)];
  const entries = await mapLimited(unique, 6, async (id): Promise<[string, PlayerProfile]> => {
    try {
      const doc = await db.collection("players").doc(id).get();
      const data = doc.exists ? doc.data() || {} : {};
      return [id, { birthDate: data.birthDate ?? null, dateOfBirth: data.dateOfBirth ?? null, age: data.age ?? null, gender: data.gender ?? null }];
    } catch {
      return [id, {}];
    }
  });
  return Object.fromEntries(entries);
}

/** The published benchmark standard the phone scores against (benchmarks/{tier}); null when unavailable. */
export async function loadBenchmarks(tier = "d1"): Promise<any | null> {
  try {
    const doc = await db.collection("benchmarks").doc(tier).get();
    return doc.exists ? doc.data() ?? null : null;
  } catch {
    return null;
  }
}
