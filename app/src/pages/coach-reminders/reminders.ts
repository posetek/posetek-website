import { useEffect, useRef, useState } from "react";
import { auth } from "../../lib/firebase";

export const vacavilleId = "vacaville-united-soccer-club";
export type ReminderAthlete = { id: string; name: string };
export type ReminderPreview = {
  eligibleHouseholds: number;
  households: { playerIds: string[] }[];
  excludedPlayers: number;
  previewToken: string;
  message: string;
};
export type Campaign = {
  id: string;
  body: string;
  status: string;
  createdAt: number;
  counts: Record<string, number>;
};
export type ParentReply = {
  id: string;
  body: string;
  receivedAt: number;
  parentLabel?: string;
  fromLast4?: string;
  command?: "STOP" | "START" | "HELP" | null;
  teamIds?: string[];
  context?: { campaignId: string; teamId: string; teamName: string; body: string; createdAt: number }[];
  forwardedTeamId?: string;
  forwardedCoachUid?: string;
};
export function dateLabel(millis: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(millis),
  );
}

// Private operations should never publish a response into another user's or team's view.
// Mount the owning form with a key that includes its current organization/team.
export function usePrivateAction() {
  const lifetime = useRef(0);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      lifetime.current++;
    },
    [],
  );
  async function run<T>(operation: () => Promise<T>, apply: (result: T) => void) {
    const uid = auth.currentUser?.uid;
    if (!uid || inFlight.current) return;
    const generation = lifetime.current;
    const current = () => lifetime.current === generation && auth.currentUser?.uid === uid;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await operation();
      if (current()) apply(result);
    } catch (cause) {
      if (current())
        setError(cause instanceof Error ? cause.message : "Could not complete this request. Try again.");
    } finally {
      if (current()) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  return { busy, error, run };
}
