import { useCallback, useRef, useState } from "react";
import { auth } from "../../lib/firebase";
import { clubCall } from "../../lib/organization-data";
import type { ClubContext } from "../../lib/organization-data";
import { useAccountLoad } from "../admin/lib/useAccountLoad";
import { staffName } from "../admin/lib/accountHierarchy";
import { dateLabel, usePrivateAction, vacavilleId } from "./reminders";
import { AdminDisclosure } from "./ReminderAdmin";

type Enrollment = { id: string; label: string; status: string; teamIds: string[]; expiresAtMillis: number };
type Coverage = { configured: boolean; heldTeamIds: string[]; partialHoldTeamIds: string[] };
type Issued = { id: string; activationUrl: string; expiresAtMillis: number };
export function CoachAccessPanel({ context }: { context: ClubContext }) {
  if (context.organization?.id !== vacavilleId || !["manager", "admin"].includes(context.role)) return null;
  return (
    <section className="coach-reminders" aria-label="Coach account invitations">
      <AdminDisclosure title="Coach invitations and team coverage">
        <EnrollmentManager key={auth.currentUser?.uid} context={context} />
      </AdminDisclosure>
    </section>
  );
}
function EnrollmentManager({ context }: { context: ClubContext }) {
  const load = useCallback(async () => {
    const [{ links }, coverage] = await Promise.all([
      clubCall<{ links: Enrollment[] }>("listCoachEnrollmentLinks", { organizationId: vacavilleId }),
      clubCall<Coverage>("getCoachWorkspaceCoverage", { organizationId: vacavilleId }),
    ]);
    return { links, coverage };
  }, []);
  const { state, refresh } = useAccountLoad(load);
  const { busy, error, run } = usePrivateAction();
  const [label, setLabel] = useState(""),
    [teams, setTeams] = useState<string[]>([]),
    [issued, setIssued] = useState<Issued | null>(null),
    [notice, setNotice] = useState("");
  const request = useRef<{ signature: string; id: string } | null>(null);
  const coverage = state.kind === "ready" ? state.data.coverage : undefined;
  const canInvite = Boolean(
    coverage?.configured && teams.length && teams.every((id) => !coverage.heldTeamIds.includes(id)),
  );
  function issue() {
    if (!canInvite) return;
    const signature = JSON.stringify([label.trim(), [...teams].sort()]);
    if (!request.current || request.current.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    const requestId = request.current.id;
    setNotice("");
    void run(
      () =>
        clubCall<Issued>("createCoachEnrollmentLink", {
          organizationId: vacavilleId,
          label: label.trim(),
          teamIds: teams,
          requestId,
        }),
      (link) => {
        setIssued(link);
        setLabel("");
        setTeams([]);
        request.current = null;
        refresh();
      },
    );
  }
  return (
    <>
      <p>
        Choose all teams assigned to this coach. They can create an account or sign in when they open the
        invitation.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          issue();
        }}
      >
        <fieldset disabled={busy}>
          <legend>New coach invitation</legend>
          <label>
            Coach name
            <input required maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <div className="reminder-players">
            {context.teams.map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  disabled={!coverage?.configured || coverage.heldTeamIds.includes(t.id)}
                  checked={teams.includes(t.id)}
                  onChange={(e) =>
                    setTeams(e.target.checked ? [...teams, t.id] : teams.filter((id) => id !== t.id))
                  }
                />
                {t.name}
                {coverage?.heldTeamIds.includes(t.id) ? " · On hold" : ""}
              </label>
            ))}
          </div>
          <button type="submit" disabled={!canInvite || !label.trim()}>
            Create private invitation
          </button>
        </fieldset>
      </form>
      {issued && (
        <fieldset>
          <legend>Share privately with the coach</legend>
          <label>
            Invitation link
            <input
              readOnly
              value={issued.activationUrl}
              autoComplete="off"
              onFocus={(e) => e.target.select()}
            />
          </label>
          <small>Expires {dateLabel(issued.expiresAtMillis)}.</small>
          <button type="button" onClick={() => setIssued(null)}>
            Done
          </button>
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <header>
        <h4>Team coverage</h4>
        <button type="button" onClick={refresh}>
          Refresh invitations
        </button>
      </header>
      {state.kind === "error" && <p role="alert">{state.message}</p>}
      {state.kind === "loading" && <p role="status">Checking invitations…</p>}
      {state.kind === "ready" && (
        <>
          {!coverage?.configured && <p>The club’s report access policy is pending review.</p>}
          {state.data.links.length >= 200 && <p>Showing up to 200 coach invitations.</p>}
          <ul>
            {context.teams.map((t) => {
              const active = context.staff
                .filter((s) => s.status === "active" && s.role === "coach" && s.teamIds.includes(t.id))
                .map(staffName);
              const pendingLinks = state.data.links
                .filter((l) => l.status === "pending" && l.teamIds.includes(t.id))
                .map((l) => l.label);
              const pendingStaff = context.invitations
                .filter(
                  (s) =>
                    s.role === "coach" &&
                    s.status === "pending" &&
                    (s.expiresAtMillis ?? 0) > Date.now() &&
                    s.teamIds.includes(t.id),
                )
                .map((s) => [s.firstName, s.lastName].filter(Boolean).join(" "));
              return (
                <li key={t.id}>
                  <strong>{t.name}</strong> ·{" "}
                  {coverage?.heldTeamIds.includes(t.id)
                    ? "Access on hold"
                    : coverage?.partialHoldTeamIds.includes(t.id)
                      ? "Some coach access is on hold"
                      : active.length
                        ? "Assigned: " + active.join(", ")
                        : "No active coach"}
                  {[...pendingLinks, ...pendingStaff].length > 0 &&
                    " · Invited: " + [...pendingLinks, ...pendingStaff].join(", ")}
                </li>
              );
            })}
          </ul>
          {state.data.links.length > 0 && (
            <details>
              <summary>Coach invitation history</summary>
              {state.data.links.map((l) => (
                <article key={l.id}>
                  <strong>{l.label}</strong> · {l.status}
                  <p>
                    {context.teams
                      .filter((t) => l.teamIds.includes(t.id))
                      .map((t) => t.name)
                      .join(", ")}
                  </p>
                  {l.status === "pending" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void run(
                          () =>
                            clubCall("revokeCoachEnrollmentLink", { organizationId: vacavilleId, id: l.id }),
                          () => {
                            if (issued?.id === l.id) setIssued(null);
                            setNotice("Invitation revoked.");
                            refresh();
                          },
                        );
                      }}
                    >
                      Revoke invitation
                    </button>
                  )}
                </article>
              ))}
            </details>
          )}
        </>
      )}
    </>
  );
}
