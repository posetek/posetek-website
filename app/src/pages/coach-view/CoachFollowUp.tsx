import { useEffect, useRef, useState } from "react";

type Recipient = { name: string; message: string; recipient: string; reason: string };

export function athleteCheckIn(name: string, reason: string): Recipient {
  const firstName = name.split(" ")[0];
  return {
    name,
    recipient: name,
    reason,
    message: `Hi ${firstName}, checking in after our last session. How has practice been going? Let me know if you need help finding your next workout.`,
  };
}

export function CoachFollowUp({ items, idSuffix = "" }: { items: Recipient[]; idSuffix?: string }) {
  const [index, setIndex] = useState(0);
  const [group, setGroup] = useState(false);
  const [drafts, setDrafts] = useState(() => items.map(item => item.message));
  const [shared, setShared] = useState("");
  const [sent, setSent] = useState<Record<number,string>>({});
  const [toast, setToast] = useState("");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const person = items[index];
  const total = items.length;
  const notified = Object.keys(sent).length;
  const value = group ? shared : sent[index] ?? drafts[index] ?? "";
  const alreadySent = !group && sent[index] !== undefined;
  function select(i: number, all = false) {
    window.clearTimeout(timer.current);
    setToast("");
    setGroup(all);
    setIndex(i);
  }
  function send() {
    if (!value.trim() || alreadySent || toast) return;
    const next = { ...sent };
    if (group) items.forEach((_,i) => { next[i] = shared.trim(); });
    else next[index] = value.trim();
    setSent(next);
    setToast(group ? `Message sent to all ${total} · demo` : "Text sent · demo");
    timer.current = window.setTimeout(() => {
      setToast("");
      if (group) { setGroup(false); setIndex(0); return; }
      const following = items.findIndex((_, i) => i > index && next[i] === undefined);
      const pending = following >= 0 ? following : items.findIndex((_, i) => next[i] === undefined);
      if (pending >= 0) setIndex(pending);
    }, 1000);
  }
  if (!person) return <section className="insights-card"><h2 id={`team-follow-up${idSuffix}`} tabIndex={-1}>Needs attention</h2><p>No follow-ups available.</p></section>;
  return <section className="insights-card cv-attention">
    <div className="card-heading"><div><h2 id={`team-follow-up${idSuffix}`} tabIndex={-1}>Needs attention</h2><p>{notified} of {total} notified · Demo messages stay in this tab.</p></div>
      <button className="quiet-button cv-group" aria-pressed={group} onClick={() => select(index,true)}>Send to all</button>
    </div>
    <div className="cv-recipients" role="group" aria-label="Select an athlete">
      {items.map((a,i) => <button key={a.name} aria-pressed={!group && i===index} onClick={() => select(i)}
        aria-label={`${a.name}, ${sent[i] !== undefined ? "notified" : "not yet notified"}`}>
        <span aria-hidden="true" className={sent[i] !== undefined ? "checked" : ""}>{sent[i] !== undefined ? "✓" : "○"}</span>{a.name}
      </button>)}
    </div>
    <div className="cv-message">
      <div className="cv-who"><div className="player-avatar" aria-hidden="true">{group ? total : person.name.split(" ").map(p => p[0]).join("")}</div>
        <div><strong>{group ? `All ${total} athletes` : person.name}</strong>
          <span className="cv-reason">{group ? "One message for everyone listed above." : person.reason}</span></div>
      </div>
      <label className="cv-to" htmlFor={`cv-followup${idSuffix}`}>{group ? "Team message" : `Message for ${person.recipient}`}</label>
      <textarea id={`cv-followup${idSuffix}`} readOnly={alreadySent} placeholder="Write your message…" value={value}
        onChange={e => { const text = e.target.value; if (group) setShared(text); else setDrafts(previous => previous.map((draft,i) => i === index ? text : draft)); }}/>
      {alreadySent ? <span className="cv-delivered">✓ Notified</span> :
        <button className="primary-cta cv-send" disabled={!value.trim() || !!toast} onClick={send}>{group ? `Send to all ${total}` : "Send"}</button>}
    </div>
    <div className={`cv-toast${toast ? " show" : ""}`} role="status">{toast}</div>
  </section>;
}
