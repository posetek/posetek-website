import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { TechniqueAuditTurn, TechniqueSessionDetail, TechniqueSessionSummary } from "../lib/ballStriking";
import { techniqueDuration, techniqueSessionPath, techniqueTime } from "../lib/ballStriking";
import { loadTechniqueSession, loadTechniqueSessions, techniqueReadError } from "../lib/ballStrikingData";
import { TECHNIQUE_PREVIEW_DETAIL, TECHNIQUE_PREVIEW_LIST } from "../lib/ballStrikingPreview";
import "../ball-striking.scss";

type Load<T> = { kind: "loading" } | { kind: "ready"; value: T } | { kind: "error"; message: string };
type Page = { nextCursor: string | null };
function useTechniquePage<T extends Page>(loader: (cursor: string | null, signal: AbortSignal) => Promise<T>, preview: T | null) {
  const [load, setLoad] = useState<Load<T>>(() => preview ? { kind: "ready", value: preview } : { kind: "loading" });
  const [busy, setBusy] = useState(false), [pageError, setPageError] = useState(""), [pageIndex, setPageIndex] = useState(0);
  const cursors = useRef<(string | null)[]>([null]), epoch = useRef(0), controller = useRef<AbortController | null>(null);
  const request = useCallback(async (cursor: string | null, index: number, reset = false) => {
    if (preview) return;
    const version = ++epoch.current;
    controller.current?.abort(); controller.current = new AbortController();
    const signal = controller.current.signal;
    setBusy(true); setPageError("");
    if (reset) { setLoad({ kind: "loading" }); cursors.current = [null]; setPageIndex(0); }
    try {
      const value = await loader(cursor, signal);
      if (signal.aborted || version !== epoch.current) return;
      if (value.nextCursor !== null && (value.nextCursor === cursor || cursors.current.slice(0, index + 1).includes(value.nextCursor))) throw new Error("Repeated page cursor");
      cursors.current = [...cursors.current.slice(0, index), cursor];
      setLoad({ kind: "ready", value }); setPageIndex(index);
    } catch (error) {
      if (signal.aborted || version !== epoch.current) return;
      if (reset) setLoad({ kind: "error", message: techniqueReadError(error) });
      else setPageError(techniqueReadError(error));
    } finally { if (!signal.aborted && version === epoch.current) setBusy(false); }
  }, [loader, preview]);
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Start an abortable external read when route identity changes.
    if (!preview) void request(null, 0, true);
    return () => { epoch.current += 1; controller.current?.abort(); };
  }, [request, preview]);
  return { load, busy, pageError, pageIndex, refresh: () => void request(null, 0, true),
    previous: () => { if (!busy && pageIndex > 0) void request(cursors.current[pageIndex - 1], pageIndex - 1); },
    next: () => { if (!busy && load.kind === "ready" && load.value.nextCursor && pageIndex < 999) void request(load.value.nextCursor, pageIndex + 1); } };
}
const readSessions = (cursor: string | null, signal: AbortSignal) => loadTechniqueSessions({ cursor, signal });
const listPath = (preview: boolean) => `/admin/ball-striking-sessions${preview ? "?preview=1" : ""}`;

export default function BallStrikingSessions({ preview = false }: { preview?: boolean }) {
  const { sessionId } = useParams();
  return <div className="ball-striking-admin">{sessionId
    ? <SessionDetail key={`${sessionId}:${preview}`} preview={preview} sessionId={sessionId} />
    : <SessionList preview={preview} />}</div>;
}
function SessionList({ preview }: { preview: boolean }) {
  const page = useTechniquePage(readSessions, preview ? TECHNIQUE_PREVIEW_LIST : null);
  useEffect(() => { document.title = "Ball striking sessions | PoseTek admin"; }, []);
  return <>
    <Heading title="Ball striking sessions" description="Review technique coaching, rep evidence and follow-up replies in one session history." busy={page.busy} preview={preview} onRefresh={page.refresh} />
    {preview && <PreviewNote />}
    {page.load.kind === "ready" ? <>
      <TechniqueSessionList sessions={page.load.value.sessions} preview={preview} />
      <Pagination {...page} nextCursor={page.load.value.nextCursor} label="sessions" />
    </> : <LoadMessage load={page.load} onRetry={page.refresh} />}
  </>;
}
function SessionDetail({ preview, sessionId }: { preview: boolean; sessionId: string }) {
  const [query] = useSearchParams(), playerId = query.get("playerId") || "";
  const loader = useCallback((cursor: string | null, signal: AbortSignal) => loadTechniqueSession(playerId, sessionId, { cursor, signal }), [playerId, sessionId]);
  const sample = TECHNIQUE_PREVIEW_LIST.sessions.find(session => session.sessionId === sessionId && session.playerId === playerId);
  if (preview && !sample) return <><Link className="technique-back" to={listPath(true)}>← Coaching sessions</Link>
    <div className="admin-card technique-empty"><h1>Sample session unavailable</h1><p>This address is not one of the synthetic preview sessions.</p></div></>;
  const previewDetail = preview && sample ? { ...TECHNIQUE_PREVIEW_DETAIL,
    session: { ...sample, memory: { ...TECHNIQUE_PREVIEW_DETAIL.session.memory, goal: sample.goal } },
    turns: TECHNIQUE_PREVIEW_DETAIL.turns.map(turn => ({ ...turn, input: { ...turn.input, goal: sample.goal } })) } : null;
  // Route identity keys the reader. Preview is isolated and performs no remote read.
  return <SessionDetailReader key={`${playerId}:${sessionId}`} loader={loader} previewDetail={previewDetail} preview={preview} />;
}
function SessionDetailReader({ loader, previewDetail, preview }: {
  loader: (cursor: string | null, signal: AbortSignal) => Promise<TechniqueSessionDetail>;
  previewDetail: TechniqueSessionDetail | null; preview: boolean;
}) {
  const page = useTechniquePage(loader, previewDetail);
  useEffect(() => { document.title = "Coaching session | PoseTek admin"; }, []);
  return <>
    <Link className="technique-back" to={listPath(preview)}>← Coaching sessions</Link>
    <Heading title="Coaching session" description="Rep and follow-up history in chronological order. Session memory below reflects the latest saved state." busy={page.busy} preview={preview} onRefresh={page.refresh} />
    {preview && <PreviewNote />}
    {page.load.kind === "ready" ? <>
      <TechniqueSessionOverview session={page.load.value.session} preview={preview} />
      <section className="technique-history" aria-labelledby="technique-history-title">
        <div className="technique-section-heading"><h2 id="technique-history-title">Session history</h2><p>Oldest first · page {page.pageIndex + 1}</p></div>
        {page.load.value.turns.length ? <ol className="technique-turns">{page.load.value.turns.map(turn => <li key={turn.requestId}><TechniqueTurn turn={turn} /></li>)}</ol>
          : <div className="admin-card technique-empty"><h3>No coaching turns yet</h3><p>This session has no saved rep feedback or follow-up replies.</p></div>}
        <Pagination {...page} nextCursor={page.load.value.nextCursor} label="turns" />
      </section>
    </> : <LoadMessage load={page.load} onRetry={page.refresh} />}
  </>;
}
function Heading({ title, description, busy, preview, onRefresh }: { title: string; description: string; busy: boolean; preview: boolean; onRefresh: () => void }) {
  return <section className="admin-heading"><div><p className="eyebrow">PoseTek admin</p><h1>{title}</h1><p>{description}</p></div>
    <div className="admin-heading-actions"><button className="quiet-button" type="button" disabled={busy || preview} onClick={onRefresh}>Refresh</button></div></section>;
}
function PreviewNote() { return <p className="technique-preview">Synthetic preview · no athlete records or model calls.</p>; }
function LoadMessage({ load, onRetry }: { load: { kind: "loading" } | { kind: "error"; message: string }; onRetry: () => void }) {
  return load.kind === "loading" ? <div className="portal-loading" role="status"><span className="spinner" /><p>Loading coaching sessions…</p></div>
    : <div className="admin-card technique-error" role="alert"><h2>Session review unavailable</h2><p>{load.message}</p><button className="quiet-button" type="button" onClick={onRetry}>Try again</button></div>;
}
function Pagination({ pageIndex, busy, pageError, nextCursor, previous, next, label }: {
  pageIndex: number; busy: boolean; pageError: string; nextCursor: string | null; previous: () => void; next: () => void; label: string;
}) {
  return <><nav className="technique-pagination" aria-label={`${label} pages`}>
    <button className="quiet-button" type="button" disabled={busy || pageIndex === 0} onClick={previous}>Previous</button>
    <span role="status">{busy ? "Loading…" : `Page ${pageIndex + 1}`}</span>
    <button className="quiet-button" type="button" disabled={busy || !nextCursor || pageIndex >= 999} onClick={next}>Next {label}</button>
  </nav>{pageError && <p className="technique-page-error" role="alert">{pageError} Your current page is still shown.</p>}</>;
}
function State({ state }: { state: TechniqueSessionSummary["status"] | TechniqueAuditTurn["status"] }) {
  const labels = { active: "Active", ended: "Ended", complete: "Complete", failed: "Failed", uncertain: "Completion uncertain" };
  return <span className={`technique-state technique-state-${state}`}>{labels[state]}</span>;
}
export function TechniqueSessionList({ sessions, preview = false }: { sessions: TechniqueSessionSummary[]; preview?: boolean }) {
  if (!sessions.length) return <div className="admin-card technique-empty"><h2>No coaching sessions yet</h2><p>Sessions will appear after an athlete starts ball striking coaching.</p></div>;
  return <section aria-label="Coaching sessions" className="technique-session-list">{sessions.map(session => <article className="admin-card technique-session" key={`${session.playerId}/${session.sessionId}`}>
    <div className="technique-session-top"><div><p className="technique-kicker">{session.playerDisplayName || "Athlete"}</p><h2><Link to={techniqueSessionPath(session, preview)}>{session.reference?.title || "Session closed before start"}</Link></h2></div><State state={session.status} /></div>
    <p className="technique-session-goal">{session.goal || "General technique coaching"}</p>
    <div className="technique-session-footer"><p><time dateTime={session.createdAt}>{techniqueTime(session.createdAt)}</time> · {session.repCount} {session.repCount === 1 ? "rep" : "reps"}</p>
      <Link className="quiet-button" to={techniqueSessionPath(session, preview)}>Open session <span aria-hidden="true">→</span></Link></div>
  </article>)}</section>;
}
export function TechniqueSessionOverview({ session, preview = false }: { session: TechniqueSessionDetail["session"]; preview?: boolean }) {
  return <div className="technique-overview">
    <section className="admin-card" aria-labelledby="technique-session-title"><div className="technique-session-top"><h2 id="technique-session-title">{session.reference?.title || "Session closed before start"}</h2><State state={session.status} /></div>
      <dl className="technique-facts"><div><dt>Player</dt><dd>{preview ? session.playerDisplayName || "Athlete" : <Link to={`/admin/accounts/player/${encodeURIComponent(session.playerId)}`}>{session.playerDisplayName || "Athlete profile"}</Link>}</dd></div>
        <div><dt>Goal</dt><dd>{session.goal || "General technique coaching"}</dd></div><div><dt>Reps</dt><dd>{session.repCount}</dd></div>
        <div><dt>Started</dt><dd>{techniqueTime(session.createdAt)}</dd></div>{session.endedAt && <div><dt>Ended</dt><dd>{techniqueTime(session.endedAt)}</dd></div>}
      </dl><p className="technique-note">{session.reference ? "The reference version is pinned for this session." : "No reference was saved before this session closed."}</p></section>
    <section className="admin-card" aria-labelledby="technique-memory-title"><h2 id="technique-memory-title">Session memory now</h2><p className="technique-note">Latest saved state · revision {session.revision}</p>
      {session.memory.focuses.length ? <ul className="technique-focuses">{session.memory.focuses.map(focus => <li key={focus.id}>{focus.label}<span>{focus.sourceRepIds.length} supporting {focus.sourceRepIds.length === 1 ? "rep" : "reps"} · {focus.evidenceIds.length} evidence {focus.evidenceIds.length === 1 ? "row" : "rows"}</span></li>)}</ul>
        : <p className="technique-memory-empty">No active focus saved.</p>}
      {session.memory.trendSummary && <p className="technique-prose">{session.memory.trendSummary}</p>}
      {session.memory.recentReps.length > 0 && <details className="technique-memory-history"><summary>Recent advice in memory · {session.memory.recentReps.length} {session.memory.recentReps.length === 1 ? "rep" : "reps"}</summary>
        <ol>{session.memory.recentReps.map(rep => <li key={rep.repId}><h3>Rep {rep.ordinal}</h3><p className="technique-prose">{rep.cue}</p>{rep.resultSummary && rep.resultSummary !== rep.cue && <p>{rep.resultSummary}</p>}<Notes notes={rep.qualityNotes} /></li>)}</ol>
      </details>}
      <p className="technique-note technique-memory-disclaimer">Coach replies are generated text. Audio delivery and acknowledgement are unknown.</p></section>
  </div>;
}
export function TechniqueTurn({ turn }: { turn: TechniqueAuditTurn }) {
  const heading = turn.kind === "rep" ? `Rep ${turn.ordinal ?? "feedback"}` : turn.kind === "chat" ? "Follow-up" : "Session ended";
  return <article className="admin-card technique-turn">
    <header className="technique-turn-heading"><div><p className="technique-kicker"><time dateTime={turn.createdAt}>{techniqueTime(turn.createdAt)}</time></p><h3>{heading}</h3></div><State state={turn.status} /></header>
    {turn.spokenOutput && <section className="technique-reply"><h4>Coach reply</h4><p className="technique-prose">{turn.spokenOutput}</p></section>}
    {turn.decisionSummary && <section className="technique-decision"><h4>Decision summary</h4><p className="technique-prose">{turn.decisionSummary}</p></section>}
    {turn.error && <div className="technique-turn-error" role="note"><h4>{turn.status === "uncertain" ? "Completion could not be confirmed" : "Coaching interrupted"}</h4><p className="technique-prose">{turn.error.message}</p></div>}
    {!turn.spokenOutput && <p className="technique-note technique-no-reply">No coach reply was saved for this turn.</p>}
    <details className="technique-context"><summary>Context &amp; evidence{turn.tools.length ? ` · ${turn.tools.length} ${turn.tools.length === 1 ? "action" : "actions"}` : ""}</summary>
    <section className="technique-turn-input" aria-label="Input at this turn"><h4>Input</h4><dl>
      <div><dt>Goal</dt><dd>{turn.input.goal || "General technique coaching"}</dd></div><div><dt>Reference</dt><dd>{turn.input.referenceTitle || "No saved reference"}</dd></div>
      <div><dt>Session memory</dt><dd>Revision {turn.input.memoryRevision}{turn.input.focuses.length ? ` · ${turn.input.focuses.map(focus => focus.label).join("; ")}` : " · No active focus"}</dd></div>
      {turn.input.message && <div><dt>Follow-up question</dt><dd className="technique-prose">{turn.input.message}</dd></div>}
    </dl></section>
    {turn.input.recentReps !== undefined && <section className="technique-prior-context" aria-label="Prior reps supplied to this turn"><h4>Prior reps supplied</h4>
      {turn.input.recentReps.length ? <ol>{turn.input.recentReps.map((rep, index) => <li key={`${rep.repId}:${index}`}><h5>Rep {rep.ordinal}</h5><p className="technique-prose">{rep.cue}</p>
        {rep.resultSummary && rep.resultSummary !== rep.cue && <p>{rep.resultSummary}</p>}<Notes notes={rep.qualityNotes} /></li>)}</ol>
        : <p className="technique-note">No prior reps were supplied.</p>}
    </section>}
    {turn.input.recentChat !== undefined && <section className="technique-prior-context" aria-label="Prior conversation supplied to this turn"><h4>Prior conversation supplied</h4>
      {turn.input.recentChat.length ? <ol>{turn.input.recentChat.map((pair, index) => <li key={index}><h5>Question</h5><p className="technique-prose">{pair.user}</p>
        <h5>Coach reply</h5><p className="technique-prose">{pair.assistant}</p></li>)}</ol>
        : <p className="technique-note">No prior conversation was supplied.</p>}
    </section>}
    {turn.input.recentReps === undefined && turn.input.recentChat === undefined && <p className="technique-note technique-prior-context">Prior rep and conversation snapshots were not recorded for this turn.</p>}
    {turn.tools.length > 0 && <section className="technique-tools" aria-label="Evidence and tool actions"><h4>Evidence &amp; tool actions</h4>{turn.tools.map((tool, index) => <section className="technique-tool" key={`${tool.name}:${index}`}>
      <div className="technique-tool-heading"><span>{readable(tool.name)}{tool.section ? ` · ${readable(tool.section)}` : ""}{tool.phase ? ` · ${readable(tool.phase)}` : ""}</span><span>{tool.returnedCount} of {tool.availableCount} available</span></div>
      {tool.evidence.length ? <div className="technique-evidence-scroll"><table><caption>{readable(tool.name)} evidence</caption><thead><tr><th scope="col">Evidence</th><th scope="col">Athlete</th><th scope="col">Reference</th><th scope="col">Quality</th></tr></thead><tbody>{tool.evidence.map(row => <tr key={row.id}>
        <th scope="row">{readable(row.label)}</th><td>{measurement(row.athlete, row.units)}</td><td>{measurement(row.reference, row.units)}</td><td>{row.qualityNotes.length ? row.qualityNotes.join(" ") : "No additional note"}</td>
      </tr>)}</tbody></table></div> : <p className="technique-note">No displayable evidence was returned by this action.</p>}
    </section>)}</section>}
    <Notes notes={turn.qualityNotes} />
    <p className="technique-note technique-model">{turn.kind === "end" ? "Session closed without a model call." : `Configured model: ${turn.model.id} · ${turn.model.effort} effort`}</p></details>
    <footer className="technique-turn-footer"><span>Response time {techniqueDuration(turn.latencyMs)}</span></footer>
  </article>;
}
function readable(value: string) { const words = value.replaceAll("_", " "); return words.charAt(0).toUpperCase() + words.slice(1); }
function measurement(value: number | null, units: string | null) { return value === null ? "Unavailable" : `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })}${units ? ` ${units}` : ""}`; }
function Notes({ notes }: { notes: string[] }) { return notes.length ? <ul className="technique-quality">{notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null; }
