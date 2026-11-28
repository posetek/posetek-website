import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { auth } from "../../lib/firebase";
import { clubCall } from "../../lib/organization-data";
import type { ClubContext } from "../../lib/organization-data";
import { useAccountLoad } from "../admin/lib/useAccountLoad";
import { staffName } from "../admin/lib/accountHierarchy";
import { dateLabel, usePrivateAction, vacavilleId } from "./reminders";
import type { ParentReply } from "./reminders";
import "./reminders.css";

export function AdminDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{title}</summary>
      {open && children}
    </details>
  );
}

type PageOfReplies = { replies: ParentReply[]; nextCursor?: string | null };
function ReplyInbox({ context }: { context: ClubContext }) {
  const [pages, setPages] = useState<string[]>([]);
  const cursor = pages.at(-1);
  const load = useCallback(
    () =>
      clubCall<PageOfReplies>("listAdminParentReplies", {
        organizationId: vacavilleId,
        ...(cursor ? { cursor } : {}),
      }),
    [cursor],
  );
  const { state, refresh } = useAccountLoad(load);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPages([]);
          refresh();
        }}
      >
        Refresh inbox
      </button>
      {state.kind === "loading" && <p role="status">Loading replies…</p>}
      {state.kind === "error" && <p role="alert">{state.message}</p>}
      {state.kind === "ready" && (
        <>
          {!state.data.replies.length && <p>No parent replies on this page.</p>}
          {state.data.replies.map((r) => (
            <ForwardReply key={r.id} reply={r} context={context} onForward={refresh} />
          ))}
          {pages.length > 0 && (
            <button type="button" onClick={() => setPages((p) => p.slice(0, -1))}>
              Newer replies
            </button>
          )}
          {state.data.nextCursor && (
            <button type="button" onClick={() => setPages((p) => [...p, state.data.nextCursor!])}>
              Older replies
            </button>
          )}
        </>
      )}
    </>
  );
}
function ForwardReply({
  reply,
  context,
  onForward,
}: {
  reply: ParentReply;
  context: ClubContext;
  onForward: () => void;
}) {
  const teamIds = reply.teamIds || [];
  const [teamId, setTeamId] = useState(teamIds.length === 1 ? teamIds[0] : "");
  const [coachUid, setCoachUid] = useState("");
  const { busy, error, run } = usePrivateAction();
  const coaches = context.staff.filter(
    (s) => s.status === "active" && s.role === "coach" && s.teamIds.includes(teamId),
  );
  const recipient = context.staff.find((s) => s.userUID === reply.forwardedCoachUid);
  return (
    <article>
      <header>
        <strong>
          {reply.parentLabel || "Parent reply"}
          {reply.fromLast4 ? " · ending " + reply.fromLast4 : ""}
        </strong>
        <small>{dateLabel(reply.receivedAt)}</small>
      </header>
      <p>{reply.body}</p>
      {!!reply.context?.length && (
        <details>
          <summary>Recent reminders to this household</summary>
          {reply.context.map((c) => (
            <blockquote key={c.campaignId}>
              <strong>{c.teamName}</strong> · {dateLabel(c.createdAt)}
              <p>{c.body}</p>
            </blockquote>
          ))}
        </details>
      )}
      {reply.command ? (
        <p role="status">
          {reply.command === "STOP"
            ? "Opt-out recorded. Further reminders are blocked."
            : "SMS keyword received: " + reply.command}
        </p>
      ) : reply.forwardedCoachUid ? (
        <p>Forwarded to {recipient ? staffName(recipient) : "the assigned coach"}.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (teamIds.includes(teamId) && coaches.some((s) => s.userUID === coachUid)) {
              void run(
                () =>
                  clubCall("forwardAdminParentReply", {
                    organizationId: vacavilleId,
                    replyId: reply.id,
                    teamId,
                    coachUid,
                  }),
                onForward,
              );
            }
          }}
        >
          <fieldset disabled={busy}>
            <legend>Forward this reply</legend>
            <label>
              Team
              <select
                required
                value={teamId}
                onChange={(e) => {
                  setTeamId(e.target.value);
                  setCoachUid("");
                }}
              >
                <option value="">Choose a team</option>
                {context.teams
                  .filter((t) => teamIds.includes(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Coach
              <select required value={coachUid} onChange={(e) => setCoachUid(e.target.value)}>
                <option value="">Choose a current coach</option>
                {coaches.map((s) => (
                  <option value={s.userUID} key={s.userUID}>
                    {staffName(s)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={!coachUid || !coaches.some((s) => s.userUID === coachUid)}>
              Forward to coach
            </button>
            {!teamIds.length && <small>Verify this household’s team before forwarding.</small>}
          </fieldset>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}

type Route = {
  state: "approved" | "held" | "revoked" | "unreviewed";
  last4?: string;
  guardianLabel?: string;
  linkedGuardianUids?: string[];
  guardianUid?: string;
  consentedAt?: number;
};
function GuardianConsent({ context }: { context: ClubContext }) {
  const [team, chooseTeam] = useState("");
  const [playerId, choosePlayer] = useState("");
  const players = context.players.filter((p) => p.organizationId === vacavilleId && p.teamId === team);
  return (
    <>
      <label>
        Team
        <select
          value={team}
          onChange={(e) => {
            chooseTeam(e.target.value);
            choosePlayer("");
          }}
        >
          <option value="">Choose a team</option>
          {context.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {team && (
        <label>
          Player
          <select value={playerId} onChange={(e) => choosePlayer(e.target.value)}>
            <option value="">Choose a player</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.firstName, p.lastName].filter(Boolean).join(" ")}
              </option>
            ))}
          </select>
        </label>
      )}
      {players.some((p) => p.id === playerId) && <ConsentForm key={playerId} playerId={playerId} />}
    </>
  );
}
function ConsentForm({ playerId }: { playerId: string }) {
  const load = useCallback(
    () => clubCall<Route>("getParentReminderRoute", { organizationId: vacavilleId, playerId }),
    [playerId],
  );
  const { state, refresh } = useAccountLoad(load);
  const { busy, error, run } = usePrivateAction();
  const [notice, setNotice] = useState("");
  const [choice, setChoice] = useState("");
  const [guardianUid, setGuardianUid] = useState("");
  const [reference, setReference] = useState(""),
    [guardian, setGuardian] = useState(""),
    [suffix, setSuffix] = useState(""),
    [date, setDate] = useState("");
  if (state.kind === "error")
    return (
      <>
        <p role="alert">{state.message}</p>
        <button type="button" onClick={refresh}>
          Retry contact check
        </button>
      </>
    );
  if (state.kind === "loading") return <p role="status">Checking guardian contact…</p>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data: Record<string, unknown> = { organizationId: vacavilleId, playerId, state: choice };
        if (choice === "approved")
          Object.assign(data, {
            evidenceRef: reference.trim(),
            guardianLabel: guardian.trim(),
            expectedLast4: suffix,
            consentedAt: new Date(date).getTime(),
            ...(guardianUid && guardianUid !== "unlinked" ? { guardianUid } : { unlinkedGuardian: true }),
            guardianVerified: true,
            consentVerified: true,
            holdsReviewed: true,
          });
        void run(
          () => clubCall("setParentReminderRoute", data),
          () => {
            setChoice("");
            setNotice("Guardian reminder settings saved.");
            refresh();
          },
        );
      }}
    >
      <p>
        SMS permission: <strong>{state.data.state}</strong>
        {state.data.last4 && " · phone ending " + state.data.last4}
      </p>
      <label>
        Change permission
        <select
          required
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value);
            setNotice("");
          }}
        >
          <option value="">Choose a change</option>
          <option value="approved">Record verified opt-in</option>
          <option value="held">Hold reminders</option>
          <option value="revoked">Revoke permission</option>
        </select>
      </label>
      {choice === "approved" && (
        <fieldset disabled={busy}>
          <legend>Guardian’s consent for team reminders</legend>
          <label>
            Guardian name
            <input required maxLength={100} value={guardian} onChange={(e) => setGuardian(e.target.value)} />
          </label>
          {!!state.data.linkedGuardianUids?.length && (
            <label>
              Guardian account on the consent record
              <select required value={guardianUid} onChange={(e) => setGuardianUid(e.target.value)}>
                <option value="">Match the guardian on the consent record</option>
                <option value="unlinked">A verified guardian without a linked account</option>
                {state.data.linkedGuardianUids.map((uid) => (
                  <option key={uid} value={uid}>
                    {uid}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Last four digits on the consent record
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
            />
          </label>
          <label>
            When consent was given
            <input required type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Consent record reference
            <input
              required
              value={reference}
              maxLength={180}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Registration form and response ID"
            />
          </label>
          <label>
            <input type="checkbox" required />I verified the guardian and the phone number on the consent
            record.
          </label>
          <label>
            <input type="checkbox" required />
            The guardian chose SMS reminders from PoseTek for this team.
          </label>
          <label>
            <input type="checkbox" required />I checked current identity, contact and outreach holds.
          </label>
        </fieldset>
      )}
      {choice && (
        <button type="submit" disabled={busy}>
          Save permission
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function ReminderAdmin({ context }: { context: ClubContext }) {
  if (context.organization?.id !== vacavilleId || !["admin", "manager"].includes(context.role)) return null;
  return (
    <section className="coach-reminders" aria-label="Parent messaging" key={auth.currentUser?.uid}>
      <h3>Parent messaging</h3>
      <AdminDisclosure title="Parent replies">
        <ReplyInbox context={context} />
      </AdminDisclosure>
      <AdminDisclosure title="Guardian SMS permission">
        <GuardianConsent context={context} />
      </AdminDisclosure>
    </section>
  );
}
