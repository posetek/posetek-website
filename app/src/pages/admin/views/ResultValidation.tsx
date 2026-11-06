// Result validation — Review tools.
//
// Choose a team testing session, then step through its reps one at a time:
// each opens in the rep tools (video or saved pose, every overlay, the
// drill's own measurement marks) with a decision panel on top. Validate the
// recorded value, adjust it, or reject the rep; the decision is saved as an
// admin revision and the queue moves on to the next rep that needs review.
//
// Results are shown everywhere whether or not they are validated. A saved
// decision becomes the source of truth; see ../lib/resultValidation.ts for
// what is written and what is kept.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DRILLS } from "../../athlete-portal/lib/drills";
import { listTestingSessions, loadValidationQueue } from "../lib/resultValidationData";
import type { TestingSessionRow, ValidationQueue, ValidationQueueRow } from "../lib/resultValidationData";
import { primaryMetricValue, primaryResultText, processingFlagged, validationStatus } from "../lib/resultValidation";
import type { ValidationDecision, ValidationState } from "../lib/resultValidation";
import RepTools from "./RepTools";
import { LIVE_REP_TOOLS_SOURCE } from "../lib/repToolsSource";
import type { RepToolsSource } from "../lib/repToolsSource";
import "../result-validation.scss";

interface ValidationBackend {
  listTestingSessions: () => Promise<TestingSessionRow[]>;
  loadValidationQueue: (eventId: string) => Promise<ValidationQueue>;
  repTools: RepToolsSource;
}

const LIVE_BACKEND: ValidationBackend = { listTestingSessions, loadValidationQueue, repTools: LIVE_REP_TOOLS_SOURCE };

type Show = "open" | "done" | "all";

const STATE_LABEL: Record<ValidationState, string> = {
  open: "Not reviewed", validated: "Validated", adjusted: "Adjusted", rejected: "Rejected", revised: "Revised",
};

const isOpen = (row: ValidationQueueRow) => row.status.state === "open";
const matchesShow = (row: ValidationQueueRow, show: Show) => show === "all" || (show === "open" ? isOpen(row) : !isOpen(row));

const dateText = (millis: number | null) => millis === null ? "Date not recorded"
  : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(millis);

export default function ResultValidation({ preview = false }: { preview?: boolean }) {
  const [search, setSearch] = useSearchParams();
  const eventId = search.get("event");
  const repKey = search.get("rep");
  const drillFilter = search.get("drill") ?? "all";
  const show = (["open", "done", "all"].includes(search.get("show") ?? "") ? search.get("show") : "open") as Show;

  const [backend, setBackend] = useState<ValidationBackend | null>(preview ? null : LIVE_BACKEND);
  const [sessions, setSessions] = useState<TestingSessionRow[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  // Keyed by session, so switching sessions never shows another session's reps.
  const [queueState, setQueueState] = useState<{ eventId: string; queue: ValidationQueue | null; error: string | null } | null>(null);
  const queue = queueState?.eventId === eventId ? queueState.queue : null;
  const queueError = queueState?.eventId === eventId ? queueState.error : null;
  const [queueGeneration, setQueueGeneration] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  // Focus mode: the workbench fills the screen and stays that way from rep to rep.
  const workbenchRef = useRef<HTMLDivElement | null>(null);
  const [focus, setFocus] = useState(false);
  const focusRef = useRef(false);
  const toggleFocus = useCallback(() => {
    const next = !focusRef.current;
    focusRef.current = next;
    setFocus(next);
    const element = workbenchRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (next && element && !document.fullscreenElement) {
      // Browser fullscreen where allowed; the full-window layout applies either way.
      try {
        const request = element.requestFullscreen?.bind(element) ?? element.webkitRequestFullscreen?.bind(element);
        const result = request?.();
        if (result && typeof (result as Promise<void>).catch === "function") (result as Promise<void>).catch(() => undefined);
      } catch { /* full-window layout only */ }
    }
    if (!next && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);
  useEffect(() => {
    // Leaving browser fullscreen (Esc) leaves focus mode too.
    const onChange = () => { if (!document.fullscreenElement && focusRef.current) { focusRef.current = false; setFocus(false); } };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => { document.removeEventListener("fullscreenchange", onChange); document.removeEventListener("webkitfullscreenchange", onChange); };
  }, []);

  useEffect(() => {
    if (!preview || !import.meta.env.DEV) return;
    let live = true;
    void import("../lib/resultValidationPreview").then(module => { if (live) setBackend(module.previewBackend()); });
    return () => { live = false; };
  }, [preview]);

  useEffect(() => { document.title = "Result validation | PoseTek admin"; }, []);

  useEffect(() => {
    if (!backend) return;
    let live = true;
    backend.listTestingSessions()
      .then(rows => { if (live) setSessions(rows); })
      .catch(error => { if (live) setSessionsError(error?.message || "Testing sessions could not be loaded."); });
    return () => { live = false; };
  }, [backend]);

  useEffect(() => {
    if (!backend || !eventId) return;
    let live = true;
    backend.loadValidationQueue(eventId)
      .then(result => { if (live) setQueueState({ eventId, queue: result, error: null }); })
      .catch(error => {
        if (!live) return;
        const message = error?.message || "The reps in this session could not be loaded.";
        setQueueState(current => ({ eventId, queue: current?.eventId === eventId ? current.queue : null, error: message }));
      });
    return () => { live = false; };
  }, [backend, eventId, queueGeneration]);

  useEffect(() => {
    if (!toast) return;
    const handle = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(handle);
  }, [toast]);

  const go = useCallback((changes: Record<string, string | null>) => {
    setSearch(current => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key); else next.set(key, value);
      }
      return next;
    });
  }, [setSearch]);

  const session = sessions?.find(item => item.id === eventId) ?? null;
  const rows = useMemo(() => queue?.rows ?? [], [queue]);
  const drillRows = useMemo(() => rows.filter(row => drillFilter === "all" || row.drillKey === drillFilter), [rows, drillFilter]);
  const visibleRows = useMemo(() => drillRows.filter(row => matchesShow(row, show) || row.key === repKey), [drillRows, show, repKey]);
  const current = repKey ? rows.find(row => row.key === repKey) ?? null : null;
  const index = current ? visibleRows.findIndex(row => row.key === current.key) : -1;

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: drillRows.length, open: 0, done: 0, flagged: 0 };
    for (const row of drillRows) {
      if (isOpen(row)) result.open++; else result.done++;
      if (row.flagged && isOpen(row)) result.flagged++;
    }
    return result;
  }, [drillRows]);
  const drillCounts = useMemo(() => {
    const result = new Map<string, { all: number; open: number }>();
    for (const row of rows) {
      const entry = result.get(row.drillKey) ?? { all: 0, open: 0 };
      entry.all++;
      if (isOpen(row)) entry.open++;
      result.set(row.drillKey, entry);
    }
    return result;
  }, [rows]);

  function openRep(row: ValidationQueueRow | null | undefined) {
    if (row) go({ rep: row.key });
  }

  function onSaved(rep: Record<string, unknown>, decision: ValidationDecision) {
    if (!current) return;
    const updated: ValidationQueueRow = {
      ...current,
      value: primaryMetricValue(current.drillKey, rep) ?? current.value,
      flagged: processingFlagged(rep),
      status: validationStatus(rep),
    };
    setQueueState(state => state?.queue ? { ...state, queue: { ...state.queue, rows: state.queue.rows.map(row => (row.key === current.key ? updated : row)) } } : state);
    setToast(`${STATE_LABEL[decision]} · ${current.playerName} · ${current.drillLabel} ${current.sessionNumber}.${current.repNumber}`);
    const position = drillRows.findIndex(row => row.key === current.key);
    const after = [...drillRows.slice(position + 1), ...drillRows.slice(0, Math.max(0, position))];
    const next = after.find(row => isOpen(row) && row.key !== current.key);
    if (next) go({ rep: next.key });
    else { go({ rep: null }); setToast(`${STATE_LABEL[decision]}. Every ${drillFilter === "all" ? "" : `${drillRows[0]?.drillLabel ?? ""} `}rep in this session has been reviewed.`); }
  }

  const queueLink = (() => {
    const next = new URLSearchParams(search);
    next.delete("rep");
    return `/admin/result-validation?${next}`;
  })();

  // MARK: one rep in the workbench
  if (eventId && repKey) {
    if (!backend || (!queue && !queueError)) return <Loading text="Loading the session…" />;
    if (queueError) return <ErrorCard text={queueError} back={queueLink} />;
    if (!current) return <ErrorCard text="That rep is not in this testing session." back={queueLink} />;
    const previous = index > 0 ? visibleRows[index - 1] : null;
    const next = index >= 0 && index < visibleRows.length - 1 ? visibleRows[index + 1] : null;
    return (
      <div className={`rv-workbench${focus ? " focus" : ""}`} ref={workbenchRef}>
        {toast && <p className="admin-banner good rv-toast" role="status"><span className="material-symbols-outlined">check_circle</span>{toast}</p>}
        <RepTools
          key={current.key}
          playerId={current.playerId}
          drillKey={current.drillKey}
          repId={current.repId}
          source={backend.repTools}
          validation={{
            eventName: session?.name ?? "Testing session",
            position: `${index + 1} of ${visibleRows.length}${show === "open" ? " to review" : ""}`,
            back: queueLink,
            onPrevious: previous ? () => openRep(previous) : null,
            onNext: next ? () => openRep(next) : null,
            onSaved,
            focus,
            onToggleFocus: toggleFocus,
          }}
        />
      </div>
    );
  }

  // MARK: the queue of one session
  if (eventId) {
    return (
      <div className="rv-page">
        <section className="admin-heading">
          <Link className="icon-button" to={`/admin/result-validation${preview ? "?preview=1" : ""}`} aria-label="Back to testing sessions">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <div>
            <p className="eyebrow">Result validation · {session ? dateText(session.createdAtMillis) : "Testing session"}</p>
            <h1>{session?.name ?? "Testing session"}</h1>
          </div>
          <div className="admin-heading-actions">
            <button className="quiet-button" type="button" onClick={() => setQueueGeneration(value => value + 1)}><span className="material-symbols-outlined">refresh</span>Reload</button>
            <button className="primary-cta" type="button" disabled={!visibleRows.length} onClick={() => openRep(visibleRows.find(isOpen) ?? visibleRows[0])}>
              <span className="material-symbols-outlined">play_arrow</span>{counts.open ? `Review ${counts.open} open` : "Open the first rep"}
            </button>
          </div>
        </section>
        {toast && <p className="admin-banner good" role="status"><span className="material-symbols-outlined">check_circle</span>{toast}</p>}
        {queueError && <p className="form-message" role="alert">{queueError}</p>}
        {queue?.failedPlayers.length ? <p className="admin-banner warn" role="alert">Reps could not be read for {queue.failedPlayers.join(", ")}. The queue below is incomplete; reload to try again.</p> : null}
        {!queue && !queueError && <Loading text="Loading every rep in the session…" />}
        {queue && (
          <section className="admin-card rv-queue">
            <div className="rv-filters">
              <div className="rv-chips" role="group" aria-label="Drill">
                <button type="button" className={`rv-chip${drillFilter === "all" ? " active" : ""}`} onClick={() => go({ drill: null })}>All drills <span>{rows.length}</span></button>
                {DRILLS.filter(drill => drillCounts.has(drill.key)).map(drill => (
                  <button key={drill.key} type="button" className={`rv-chip${drillFilter === drill.key ? " active" : ""}`} onClick={() => go({ drill: drill.key })}>
                    {drill.label} <span>{drillCounts.get(drill.key)!.open}/{drillCounts.get(drill.key)!.all}</span>
                  </button>
                ))}
              </div>
              <div className="rv-segment" role="group" aria-label="Show">
                {([["open", `Needs review · ${counts.open}`], ["done", `Reviewed · ${counts.done}`], ["all", `All · ${counts.all}`]] as [Show, string][]).map(([value, label]) => (
                  <button key={value} type="button" className={show === value ? "active" : ""} onClick={() => go({ show: value === "open" ? null : value })}>{label}</button>
                ))}
              </div>
            </div>
            {counts.flagged > 0 && <p className="admin-note">{counts.flagged} open rep{counts.flagged === 1 ? " was" : "s were"} flagged by the phone (partial or invalid processing).</p>}
            {!rows.length && <p className="admin-note">No processed reps are linked to this testing session yet.</p>}
            {rows.length > 0 && !visibleRows.length && <p className="admin-note">Nothing to show with these filters{show === "open" ? ": every rep here has been reviewed." : "."}</p>}
            {visibleRows.length > 0 && (
              <div className="rv-table-wrap">
                <table className="rv-table">
                  <thead><tr><th>Player</th><th>Drill</th><th>Rep</th><th>Result</th><th>Status</th></tr></thead>
                  <tbody>
                    {visibleRows.map(row => (
                      <tr key={row.key} tabIndex={0} onClick={() => openRep(row)} onKeyDown={event => { if (event.key === "Enter") openRep(row); }}>
                        <td>{row.playerName}</td>
                        <td>{row.drillLabel}</td>
                        <td>Session {row.sessionNumber} · Rep {row.repNumber}</td>
                        <td className="rv-value">{primaryResultText(row.drillKey, row.value)}</td>
                        <td>
                          <span className={`rv-status ${row.status.state}`}>{STATE_LABEL[row.status.state]}</span>
                          {row.flagged && isOpen(row) && <span className="rv-status flagged">Flagged</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    );
  }

  // MARK: choose a testing session
  const words = filterText.trim().toLocaleLowerCase();
  const shownSessions = (sessions ?? []).filter(item => !words || item.name.toLocaleLowerCase().includes(words));
  return (
    <div className="rv-page">
      <section className="admin-heading">
        <div>
          <p className="eyebrow">Review tools</p>
          <h1>Result validation</h1>
          <p className="admin-note">Pick a team testing session to step through its reps. Results are shown whether or not they are validated; a validated or adjusted value becomes the result, and the phone's original output is kept.</p>
        </div>
      </section>
      {sessionsError && <p className="form-message" role="alert">{sessionsError}</p>}
      {!sessions && !sessionsError && <Loading text="Loading testing sessions…" />}
      {sessions && (
        <section className="admin-card rv-sessions">
          <label className="admin-field">
            <span>Find a session</span>
            <input type="search" value={filterText} placeholder="Team or session name" onChange={event => setFilterText(event.target.value)} />
          </label>
          {!shownSessions.length && <p className="admin-note">{sessions.length ? "No session matches." : "No testing sessions yet."}</p>}
          <ul className="rv-session-list">
            {shownSessions.map(item => (
              <li key={item.id}>
                <button type="button" onClick={() => go({ event: item.id, rep: null, drill: null, show: null })}>
                  <span className="rv-session-name">{item.name}</span>
                  <span className="admin-row-meta">
                    <span>{dateText(item.createdAtMillis)}</span>
                    <span>{item.participantCount} player{item.participantCount === 1 ? "" : "s"}</span>
                    <span className="admin-chip">{item.status}</span>
                  </span>
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </li>
            ))}
          </ul>
          {sessions.length >= 60 && <p className="admin-note">Showing the 60 most recent sessions.</p>}
        </section>
      )}
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return <div className="portal-loading"><span className="spinner" /><p>{text}</p></div>;
}

function ErrorCard({ text, back }: { text: string; back: string }) {
  return (
    <section className="admin-card">
      <p className="form-message" role="alert">{text}</p>
      <Link className="quiet-button" to={back}><span className="material-symbols-outlined">arrow_back</span>Back to the queue</Link>
    </section>
  );
}
