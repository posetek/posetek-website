import { useCallback, useRef, useState } from "react";
import { clubCall } from "../../lib/organization-data";
import { auth } from "../../lib/firebase";
import { useAccountLoad } from "../admin/lib/useAccountLoad";
import { dateLabel, usePrivateAction, vacavilleId } from "../coach-reminders/reminders";
import type { Campaign, ParentReply, ReminderAthlete, ReminderPreview } from "../coach-reminders/reminders";
import "../coach-reminders/reminders.css";

type Props = { organizationId: string; teamId: string; athletes: ReminderAthlete[] };
type Preview = ReminderPreview & { selected: string[]; draft: string; requestId: string };
export function CoachParentReminders(props: Props) {
  if (props.organizationId !== vacavilleId) return null;
  return <ParentReminders key={JSON.stringify([auth.currentUser?.uid, props.teamId])} {...props} />;
}
function ParentReminders({ teamId, athletes }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const intent = useRef<{ signature: string; id: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState("");
  const [composing, setComposing] = useState(false);
  const { busy, error, run } = usePrivateAction();
  const load = useCallback(async () => {
    const [{ reminders }, { replies }] = await Promise.all([
      clubCall<{ reminders: Campaign[] }>("listCoachReminders", { teamId }),
      clubCall<{ replies: ParentReply[] }>("listCoachParentReplies", { teamId }),
    ]);
    return { reminders, replies };
  }, [teamId]);
  const history = useAccountLoad(load);
  const playerIds = selected.filter((id) => athletes.some((a) => a.id === id));
  const ready =
    preview &&
    preview.draft === body.trim() &&
    playerIds.length === preview.selected.length &&
    playerIds.every((id) => preview.selected.includes(id))
      ? preview
      : null;
  function changeSelection(ids: string[]) {
    setPreview(null);
    setNotice("");
    setSelected(ids);
  }
  function checkRecipients() {
    const draft = body.trim();
    if (!draft || !playerIds.length) return;
    const signature = JSON.stringify([teamId, [...playerIds].sort(), draft]);
    if (intent.current?.signature !== signature) intent.current = { signature, id: crypto.randomUUID() };
    const requestId = intent.current.id;
    setNotice("");
    setPreview(null);
    void run(
      () => clubCall<ReminderPreview>("previewCoachReminder", { teamId, playerIds, body: draft }),
      (data) => {
        if (!Array.isArray(data.households) || data.households.length !== data.eligibleHouseholds) {
          throw new Error("Could not confirm the recipient list. Preview the reminder again.");
        }
        const covered = data.households.flatMap((household) => household.playerIds);
        if (
          data.households.some((h) => !Array.isArray(h.playerIds) || !h.playerIds.length) ||
          new Set(covered).size !== covered.length ||
          covered.some((id) => !playerIds.includes(id)) ||
          covered.length + data.excludedPlayers !== playerIds.length
        ) {
          throw new Error("The recipient list changed. Preview the reminder again.");
        }
        setPreview({ ...data, draft, selected: playerIds, requestId });
      },
    );
  }
  function send() {
    if (!ready || !ready.eligibleHouseholds) return;
    const { requestId, previewToken, draft, selected: ids } = ready;
    void run(
      () => clubCall("submitCoachReminder", { teamId, playerIds: ids, body: draft, requestId, previewToken }),
      () => {
        setPreview(null);
        setBody("");
        setSelected([]);
        setComposing(false);
        intent.current = null;
        setNotice("Reminder queued. Refresh delivery status below.");
        history.refresh();
      },
    );
  }
  return (
    <section className="coach-reminders" aria-label="Parent reminders">
      <header>
        <h2>Parent reminders</h2>
        <button
          className="primary-cta"
          type="button"
          aria-expanded={composing}
          onClick={() => setComposing(!composing)}
          disabled={busy}
        >
          {composing ? "Close draft" : "Remind parents"}
        </button>
      </header>
      {composing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            checkRecipients();
          }}
        >
          <fieldset disabled={busy}>
            <legend>Choose players</legend>
            <label>
              <input
                type="checkbox"
                checked={athletes.length > 0 && playerIds.length === athletes.length}
                onChange={(e) => changeSelection(e.target.checked ? athletes.map((a) => a.id) : [])}
              />{" "}
              Entire team
            </label>
            <div className="reminder-players">
              {athletes.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={playerIds.includes(a.id)}
                    onChange={(e) =>
                      changeSelection(
                        e.target.checked ? [...playerIds, a.id] : playerIds.filter((id) => id !== a.id),
                      )
                    }
                  />
                  {a.name}
                </label>
              ))}
            </div>
            <label>
              Reminder text
              <textarea
                rows={3}
                required
                maxLength={480}
                value={body}
                onChange={(e) => {
                  setPreview(null);
                  setBody(e.target.value);
                }}
              />
            </label>
            <button type="submit" disabled={!body.trim() || !playerIds.length}>
              Preview recipients and text
            </button>
          </fieldset>
          {ready && (
            <section className="reminder-preview" aria-label="Review text before sending">
              <h3>
                {ready.eligibleHouseholds} eligible{" "}
                {ready.eligibleHouseholds === 1 ? "household" : "households"}
              </h3>
              <ul aria-label="Players covered by each household">
                {ready.households.map((household) => (
                  <li key={JSON.stringify(household.playerIds)}>
                    {household.playerIds
                      .map((id) => athletes.find((a) => a.id === id)?.name)
                      .filter(Boolean)
                      .join(" and ")}
                  </li>
                ))}
              </ul>
              {ready.excludedPlayers > 0 && (
                <p>
                  {ready.excludedPlayers} {ready.excludedPlayers === 1 ? "player has" : "players have"} no
                  eligible parent contact.
                </p>
              )}
              <blockquote>{ready.message}</blockquote>
              <p>Replies go to Vacaville Admin.</p>
              <button
                type="button"
                className="primary-cta"
                disabled={busy || ready.eligibleHouseholds === 0}
                onClick={send}
              >
                Send reminder
              </button>
            </section>
          )}
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <header>
        <h3>Recent reminders and replies</h3>
        <button type="button" onClick={history.refresh}>
          Refresh status
        </button>
      </header>
      {history.state.kind === "loading" && <p role="status">Loading messages…</p>}
      {history.state.kind === "error" && <p role="alert">{history.state.message}</p>}
      {history.state.kind === "ready" && (
        <>
          {!history.state.data.reminders.length && <p>No reminders yet.</p>}
          {history.state.data.reminders.map((c) => (
            <article key={c.id}>
              <strong>{dateLabel(c.createdAt)}</strong>
              <p>{c.body}</p>
              <small>
                {Object.entries(c.counts)
                  .filter(([, count]) => count > 0)
                  .map(([k, n]) => n + " " + k)
                  .join(" · ")}
              </small>
            </article>
          ))}
          {history.state.data.replies.length > 0 && <h4>Forwarded by Vacaville Admin</h4>}
          {history.state.data.replies.map((r) => (
            <article key={r.id}>
              <strong>{dateLabel(r.receivedAt)}</strong>
              <p>{r.body}</p>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
