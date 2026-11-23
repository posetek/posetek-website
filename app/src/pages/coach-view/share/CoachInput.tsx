import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { categories, type Category, type CoachNote } from "./coachNotes";
import "./coach-input.css";

interface CoachInputProps {
  teamName: string;
  players: string[];
  notes: CoachNote[];
  saveNote: (input: { player: number; category: Category; detail: string }) => Promise<void>;
  onClose: () => void;
  loadError?: string;
  loading?: boolean;
}

const prompts = {
  Technique: "Work on opening the first touch toward space.",
  Speed: "Focus on the first three steps after changing direction.",
  Strength: "Work on holding balance through contact.",
  Fitness: "Keep the same pace through the final sprint.",
} satisfies Record<Category, string>;

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return (words[0][0] || "") + (words.length > 1 ? words[words.length - 1][0] : "");
}

export function CoachInput({ teamName, players, notes, saveNote, onClose, loadError, loading }: CoachInputProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const roster = useRef<HTMLDivElement>(null);
  const focusHeading = useRef<HTMLHeadingElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const saving = useRef(false);
  const [player, setPlayer] = useState<number | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const priorFocus = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    heading.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      document.body.style.overflow = originalOverflow;
      if (priorFocus instanceof HTMLElement && priorFocus.isConnected) priorFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (player !== null) focusHeading.current?.focus({ preventScroll: true });
  }, [player]);

  useEffect(() => {
    if (category !== null) field.current?.focus();
  }, [category]);

  function returnToRoster() {
    setPlayer(null);
    setCategory(null);
    setDetail("");
    setSaveError("");
    requestAnimationFrame(() => {
      roster.current?.querySelector<HTMLButtonElement>(`[data-player="${player}"]`)?.focus();
    });
  }

  function navigateRoster(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLButtonElement)) return;
    const index = Number(event.target.dataset.player);
    const next = { ArrowDown: Math.min(index + 1, players.length - 1), ArrowUp: Math.max(index - 1, 0), Home: 0, End: players.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    roster.current?.querySelector<HTMLButtonElement>(`[data-player="${next}"]`)?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (player === null || !category || !detail.trim() || saving.current || loading || loadError) return;
    saving.current = true;
    setBusy(true);
    setSaveError("");
    try {
      await saveNote({ player, category, detail: detail.trim() });
      setMessage(`Input saved for ${players[player]}.`);
      returnToRoster();
    } catch {
      setSaveError("Your input couldn’t be saved. Keep this window open and try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <dialog className="coach-input" ref={dialog} aria-labelledby="coach-input-title"
    onCancel={event => { event.preventDefault(); if (!saving.current) onClose(); }}>
    <header className="coach-input__header">
      <p className="coach-input__team">{teamName.split(" — ")[0]}</p>
      <h2 id="coach-input-title" ref={heading} tabIndex={-1}>Coaches Attention</h2>
      <button className="coach-input__close" aria-label="Close Coaches Attention" type="button" onClick={onClose} disabled={busy}>
        <svg viewBox="0 0 24 24" height="18" width="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12m0-12L6 18"/></svg>
      </button>
    </header>
    <div className="coach-input__body">
      {loadError && <p className="coach-input__error" role="alert">{loadError}</p>}
      {player === null ? <>
        <p className="coach-input__lead">Choose a player to add a coaching note.</p>
        <div className="coach-input__section-heading">
          <h3>Team roster</h3><span>{players.length} {players.length === 1 ? "player" : "players"}</span>
        </div>
        {players.length ? <div className="coach-input__roster" ref={roster} role="group" aria-label="Choose a player" onKeyDown={navigateRoster}>
          {players.map((name, index) => <button key={index} type="button" className="coach-input__player" data-player={index} aria-label={name}
            onClick={() => { setPlayer(index); setMessage(""); }}>
            <span className="coach-input__initials" aria-hidden="true">{initials(name)}</span>
            <span>{name}</span><span className="coach-input__arrow" aria-hidden="true">›</span>
          </button>)}
        </div> : <p className="coach-input__empty">There are no players on this roster yet.</p>}
        <div role="status" className="coach-input__status">{message}</div>
        {loading && <p role="status">Loading saved input…</p>}
        {notes.length > 0 && <details className="coach-input__history">
          <summary>Saved input <span>{notes.length}</span></summary>
          <ul>{notes.map(note => <li key={note.id}>
            <strong>{players[note.player]}</strong><span>{note.category}</span>
            <p>{note.detail}</p>
          </li>)}</ul>
        </details>}
        <button className="coach-input__exit" type="button" onClick={onClose}>View team report <span aria-hidden="true">→</span></button>
      </> : <form onSubmit={submit}>
        <div className="coach-input__selected">
          <span className="coach-input__initials" aria-hidden="true">{initials(players[player])}</span>
          <strong>{players[player]}</strong>
          <button className="coach-input__change" onClick={() => { setMessage(""); returnToRoster(); }} disabled={busy} type="button">Change player</button>
        </div>
        <h3 className="coach-input__question" id="coach-input-focus" tabIndex={-1} ref={focusHeading}>Choose a focus</h3>
        <div className="coach-input__presets" role="group" aria-labelledby="coach-input-focus">
          {categories.map(option => <button key={option} type="button" aria-pressed={category === option} disabled={busy}
            onClick={() => { setCategory(option); setSaveError(""); }}>
            {option}<span aria-hidden="true">{category === option ? "✓" : "+"}</span>
          </button>)}
        </div>
        {category && <div className="coach-input__entry">
          <label htmlFor="coach-input-detail">What should they work on?</label>
          <p id="coach-input-hint">Describe it in one sentence.</p>
          <textarea id="coach-input-detail" ref={field} aria-describedby="coach-input-hint" value={detail}
            onChange={event => setDetail(event.target.value)} required maxLength={1000} disabled={busy}
            placeholder={`e.g. ${prompts[category]}`} rows={3} enterKeyHint="done"
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}/>
          {saveError && <p className="coach-input__error" role="alert">{saveError}</p>}
          <p className="coach-input__privacy">Anyone with this team link can read saved input.</p>
          <button className="coach-input__save" type="submit" disabled={!detail.trim() || busy || loading || !!loadError}>
            {busy ? "Saving…" : "Save input"}<span aria-hidden="true">↵</span>
          </button>
        </div>}
      </form>}
    </div>
  </dialog>;
}
