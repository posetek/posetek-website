import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { categories, coachDemo, localCoachNotes, type Category, type CoachNote } from "./coachNotes";
import "./coach-input.css";

interface CoachInputProps {
  teamName: string;
  teams?: string[];
  teamIndex?: number;
  onSelectTeam?: (index: number) => void;
  players: string[];
  notes: CoachNote[];
  saveNote: (input: { player: number; category: Category; detail: string }) => Promise<void>;
  onClose: () => void;
  loadError?: string;
  loading?: boolean;
  authenticated?: boolean;
}

const prompts = {
  Technique: "Open up your first touch toward space.",
  Speed: "Drive through the first three steps after a turn.",
  Strength: "Stay balanced through shoulder contact.",
  Fitness: "Hold the same pace through the final sprint.",
} satisfies Record<Category, string>;

function Chevron() {
  return <svg className="coach-input__chevron" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"
    fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m6 3 5 5-5 5"/></svg>;
}

export function CoachInput({
  teamName, teams, teamIndex = 0, onSelectTeam, players, notes, saveNote, onClose, loadError, loading, authenticated,
}: CoachInputProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const roster = useRef<HTMLDivElement>(null);
  const focusHeading = useRef<HTMLHeadingElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const saving = useRef(false);
  const [player, setPlayer] = useState<number | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [pendingExit, setPendingExit] = useState<"results" | "roster" | null>(null);
  const teamOptions = teams && teams.length > 1 && onSelectTeam ? teams : [];
  const activeTeamName = teams?.[teamIndex] || teamName;

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

  useEffect(() => {
    if (pendingExit) keepEditing.current?.focus();
  }, [pendingExit]);

  function returnToRoster() {
    setPlayer(null);
    setCategory(null);
    setDetail("");
    setSaveError("");
    requestAnimationFrame(() => {
      roster.current?.querySelector<HTMLButtonElement>(`[data-player="${player}"]`)?.focus();
    });
  }

  function leave(destination: "results" | "roster") {
    setPendingExit(null);
    if (destination === "results") onClose();
    else returnToRoster();
  }

  function requestExit(destination: "results" | "roster") {
    if (saving.current) return;
    if (detail.trim()) setPendingExit(destination);
    else leave(destination);
  }

  function resumeDraft() {
    setPendingExit(null);
    requestAnimationFrame(() => field.current?.focus());
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
      setMessage(`Note saved for ${players[player]}.`);
      returnToRoster();
    } catch {
      setSaveError("Your note couldn’t be saved. Try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <dialog className="coach-input" ref={dialog} aria-labelledby="coach-input-title"
    onCancel={event => { event.preventDefault(); if (pendingExit) resumeDraft(); else requestExit("results"); }}>
    <header className="coach-input__header">
      {coachDemo && <p className="coach-input__sample">Coach demo · Sample data</p>}
      <h2 id="coach-input-title" ref={heading} tabIndex={-1} aria-describedby={player === null && teamOptions.length > 0 ? "coach-input-active-team" : undefined}>Coaches Input</h2>
      {coachDemo && <p className="coach-input__local-note">Notes stay in this browser.</p>}
      {!pendingExit && <button className="coach-input__close" aria-label="Close Coaches Input" type="button"
        onClick={() => requestExit("results")} disabled={busy}>
        <svg viewBox="0 0 24 24" height="18" width="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m6 6 12 12m0-12L6 18"/></svg>
      </button>}
    </header>
    <div className="coach-input__body">
      {pendingExit ? <section className="coach-input__discard" aria-labelledby="coach-discard-title">
        <h3 id="coach-discard-title">Discard this note?</h3>
        <p>Your note for {player !== null && players[player]} hasn’t been saved.</p>
        <button type="button" className="coach-input__primary" ref={keepEditing} onClick={resumeDraft}>Keep editing</button>
        <button type="button" className="coach-input__secondary" onClick={() => leave(pendingExit)}>Discard note</button>
      </section> : <>
        {loadError && <p className="coach-input__error" role="alert">{loadError}</p>}
        {player === null ? <>
          {teamOptions.length > 0 && <div className="coach-input__teams" role="group" aria-label="Choose a team">
            {teamOptions.map((name, index) => <button type="button" key={index} aria-pressed={teamIndex === index}
              id={teamIndex === index ? "coach-input-active-team" : undefined}
              onClick={() => { if (index !== teamIndex) onSelectTeam?.(index); }}>{name}</button>)}
          </div>}
          {teamOptions.length === 0 && <p className="coach-input__team">{activeTeamName}</p>}
          <div className="coach-input__section-heading">
            <h3>Choose a player</h3><span>{players.length} {players.length === 1 ? "player" : "players"}</span>
          </div>
          {players.length ? <div className="coach-input__roster" ref={roster} role="group" aria-label={`${activeTeamName} roster`} onKeyDown={navigateRoster}>
            {players.map((name, index) => <button key={index} type="button" className="coach-input__player" data-player={index}
              onClick={() => { setPlayer(index); setMessage(""); }}>
              <span>{name}</span><Chevron/>
            </button>)}
          </div> : <p className="coach-input__empty">No players on this roster yet.</p>}
          <div role="status" className="coach-input__status">{message || (loading ? "Loading saved notes…" : "")}</div>
          {notes.length > 0 && <details className="coach-input__history">
            <summary>Saved notes <span>({notes.length})</span></summary>
            <ul>{notes.map(note => <li key={note.id}>
              <strong>{players[note.player]}</strong><span>{note.category}</span>
              <p>{note.detail}</p>
            </li>)}</ul>
          </details>}
          <button className="coach-input__secondary coach-input__exit" type="button" onClick={() => requestExit("results")}>View team results <Chevron/></button>
        </> : <form onSubmit={submit}>
          <div className="coach-input__selected">
            <div><p className="coach-input__team">{activeTeamName}</p><strong>{players[player]}</strong></div>
            <button className="coach-input__change" onClick={() => requestExit("roster")} disabled={busy} type="button">Change player</button>
          </div>
          <h3 className="coach-input__question" id="coach-input-focus" tabIndex={-1} ref={focusHeading}>Choose a focus</h3>
          <div className="coach-input__presets" role="group" aria-labelledby="coach-input-focus">
            {categories.map(option => <button key={option} type="button" aria-pressed={category === option} disabled={busy}
              onClick={() => { setCategory(option); setSaveError(""); }}>
              {option}<span aria-hidden="true" className="coach-input__radio"/>
            </button>)}
          </div>
          {category && <div className="coach-input__entry">
            <label htmlFor="coach-input-detail">Add a coaching note</label>
            <p id="coach-input-hint">In one sentence, what should they work on?</p>
            <textarea id="coach-input-detail" ref={field} aria-describedby="coach-input-hint" value={detail}
              onChange={event => setDetail(event.target.value)} required maxLength={1000} disabled={busy}
              placeholder={prompts[category]} rows={3} enterKeyHint="done"
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}/>
            {saveError && <p className="coach-input__error" role="alert">{saveError}</p>}
            {!coachDemo && <p className="coach-input__privacy">{authenticated ? "This note is private to your coach account." : localCoachNotes ? "Offline preview. Notes are saved in this browser." : "Anyone with this report link can read saved notes."}</p>}
            <button className="coach-input__primary" type="submit" disabled={!detail.trim() || busy || loading || !!loadError}>
              {busy ? "Saving…" : "Save note"}
            </button>
          </div>}
        </form>}
      </>}
    </div>
  </dialog>;
}
