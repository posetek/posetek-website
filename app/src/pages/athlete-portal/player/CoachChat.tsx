import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { auth, db } from '../../../lib/firebase';
import { dateText } from '../lib/mobile';
import { MultilineText } from '../views/shared';
import { capabilityEnabled, streamCoach, useCoachConfig, validHandoff } from './gateway';
import type { Row } from './execution';
import { coachGreeting, coachPrompts, coachToolPhrase, coachToolStatus } from './coach-prompts';
import type { PersonalWorkoutStore } from './use-personal-workouts';
import CoachPersonalWorkout from './CoachPersonalWorkout';
import AISharingControl from './AISharingControl';
import CoachSheet from './coach/CoachSheet';
import CoachHistoryMenu from './coach/CoachHistoryMenu';
import CoachMemoryPanel, { SharingOffNotice } from './coach/CoachMemoryPanel';
import CoachRunner from './coach/CoachRunner';
import { CoachTechniqueLink, CoachTechniquePage } from './coach/CoachTechnique';
import { CoachReplyText } from './coach/coach-reply';
import { coachErrorMessage, coachRefCode } from './coach/coach-errors';
import { coachMemories } from './coach/coach-memory';
import { MemoryIcon, SendIcon, SharingIcon } from './coach/coach-icons';
import loaderIcon from './coach/v4-loader.svg';
import './coach/coach.css';

type Props = { playerId: string; preview: boolean; capability?: string; context?: Row; initialText?: string;
  onDraft?: (draft: Row | null) => void; onHandoff?: (request: Row) => void; personalStore?: PersonalWorkoutStore; athlete?: Row; active?: boolean;
  /**
   * `tab` is the app's Coach tab (`AICoachTabView`, the V4 layout); `embedded` is the chat inside a
   * workout or drill. Defaults to `tab` for `pose_chat`, the only capability the Coach tab uses.
   */
  variant?: 'tab' | 'embedded';
  /** The recorded kicks and replay link behind the Coach tab's Technique analysis page. */
  technique?: { reps: Row[]; onReplay: (rep: Row) => void };
  /**
   * Embedded chat only: shown inside the conversation, directly under the last reply (the proposed
   * workout with its Save buttons), so it reads as part of the answer and scrolls with it.
   */
  afterMessages?: ReactNode;
};

type Sheet = '' | 'history' | 'memory' | 'sharing' | 'voice';

/** The app's `V4LoadingRow`: the pose loader, glowing unless motion is reduced, and a caption. */
function LoadingRow({ text }: { text: string }) {
  return <div className="coach-loading-row" role="status"><img src={loaderIcon} alt="" width={32} height={32} /><span>{text}</span></div>;
}

const conversationDate = (value: Row | undefined) => {
  const date = value?.toDate?.();
  return date instanceof Date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '';
};

export default function CoachChat({ playerId, preview, capability = 'pose_chat', context, initialText = '', onDraft, onHandoff, personalStore, athlete, active = true, variant, technique, afterMessages }: Props) {
  const config = useCoachConfig(preview);
  const [draft, setDraft] = useState(initialText), [messages, setMessages] = useState<Row[]>([]);
  const [answer, setAnswer] = useState(''), [sending, setSending] = useState(false), [error, setError] = useState('');
  const [history, setHistory] = useState<Row[]>([]), [showHistory, setShowHistory] = useState(false);
  const [memory, setMemory] = useState<Row | null>(null), [showMemory, setShowMemory] = useState(false);
  const [status, setStatus] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  // The Coach tab's own state (the embedded chat does not use it).
  const [sheet, setSheet] = useState<Sheet>('');
  const [historyStatus, setHistoryStatus] = useState<'loading' | 'ready' | 'failed'>(preview ? 'ready' : 'loading');
  const [errorRequest, setErrorRequest] = useState('');
  const [memoryBusy, setMemoryBusy] = useState(false), [memoryNotice, setMemoryNotice] = useState('');
  const [handoffReady, setHandoffReady] = useState(false);
  const [runnerPass, setRunnerPass] = useState<number | null>(null), [runnerAllowed, setRunnerAllowed] = useState(false);
  const [confirmForgetAll, setConfirmForgetAll] = useState(false);
  const [transcriptError, setTranscriptError] = useState('');
  const controller = useRef<AbortController | null>(null), conversation = useRef<string | null>(null);
  const historyLoadingRef = useRef(false);
  const turn = useRef(0), messageRoot = useRef<HTMLDivElement>(null), afterPanel = useRef<HTMLDivElement>(null);
  const runnerCount = useRef(0), runnerIntroPlayed = useRef(false), section = useRef<HTMLElement>(null);
  const sharingRetry = useRef<{ allowed: boolean; resend: boolean; memory: boolean }>({ allowed: false, resend: false, memory: false });
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const tab = (variant ?? (capability === 'pose_chat' ? 'tab' : 'embedded')) === 'tab';
  const workspace = capability === 'pose_chat' && config?.coachWorkspaceEnabled === true;
  const canChat = capabilityEnabled(config, capability);
  const streaming = sending && !memoryBusy;
  const voiceEnabled = !!config && config.globalEnabled !== false && !config.unavailable && config.capabilities?.voice_route?.enabled === true &&
    Number.isInteger(config.capabilities.voice_route.dailyLimitPerUser) && config.capabilities.voice_route.dailyLimitPerUser > 0;
  // `AIChatSurface.canPlayRunner`: the Coach tab on screen with no sheet over it, a visible page and full motion.
  const canPlayRunner = tab && active && !sheet && runnerAllowed && !!playerId && canChat;
  const readMessages = async (id: string): Promise<Row[]> => {
    const snap = await db.collection('players').doc(playerId).collection('aiConversations').doc(id).collection('messages').orderBy('createdAt').get({ source: 'server' });
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  };
  useEffect(() => {
    if (preview) return;
    const base = db.collection('players').doc(playerId).collection('aiConversations')
      .where('capability', '==', capability).where('createdByUid', '==', auth.currentUser?.uid || '');
    return base.onSnapshot(s => {
      setHistory(s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a: Row, b: Row) =>
        (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0)));
      setHistoryStatus('ready');
    }, e => {
      // The Coach tab says so inside its History sheet, as the app does.
      if (tab) setHistoryStatus('failed');
      else { setError(`History: ${e.message}`); setErrorCode(''); }
    });
  }, [playerId, preview, capability, tab]);
  useEffect(() => () => { turn.current++; controller.current?.abort(); }, []);
  const hasAfter = !!afterMessages;
  useEffect(() => {
    if (!tab) {
      const root = messageRoot.current, panel = afterPanel.current;
      // With a proposal under the reply, show where it begins and the end of the reply above it,
      // not its far end; otherwise follow the conversation to the bottom.
      if (root && panel) root.scrollTop += panel.getBoundingClientRect().top - root.getBoundingClientRect().top - 72;
      else root?.scrollTo({ top: root.scrollHeight });
      return;
    }
    // The page is the Coach tab's scroll view; a hidden tab never moves it.
    if (active && (messages.length || answer)) window.scrollTo({ top: document.documentElement.scrollHeight });
    // Only a transcript change scrolls; returning to the tab keeps the athlete's place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, answer, hasAfter]);
  useEffect(() => {
    if (!tab || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setRunnerAllowed(!motion.matches && document.visibilityState === 'visible');
    sync();
    motion.addEventListener?.('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => { motion.removeEventListener?.('change', sync); document.removeEventListener('visibilitychange', sync); };
  }, [tab]);
  useEffect(() => { runnerIntroPlayed.current = false; }, [playerId]);
  useEffect(() => {
    if (!canPlayRunner) { setRunnerPass(null); return; }
    if (!runnerIntroPlayed.current) { runnerIntroPlayed.current = true; setRunnerPass(++runnerCount.current); }
  }, [canPlayRunner, playerId]);
  useEffect(() => {
    // The composer stays on the bottom edge even when the transcript is short.
    if (!tab || !active) return;
    const measure = () => { const el = section.current; if (el) el.style.setProperty('--coach-top', `${Math.max(0, el.getBoundingClientRect().top + window.scrollY)}px`); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [tab, active]);
  useEffect(() => {
    // One to five lines, as the app's composer (`lineLimit(1...5)`).
    const input = composerInput.current;
    if (!tab || !input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }, [draft, tab]);

  const clearError = () => { setError(''); setErrorCode(''); setErrorRequest(''); };
  const reset = () => {
    turn.current++; controller.current?.abort(); controller.current = null;
    historyLoadingRef.current = false; setHistoryLoading(false);
    conversation.current = null; setMessages([]); setAnswer(''); setSending(false); setError(''); setErrorCode(''); onDraft?.(null);
    if (tab) { setErrorRequest(''); setMemoryBusy(false); setHandoffReady(false); setTranscriptError(''); setStatus(''); setDraft(''); }
  };
  const openHistory = async (item: Row) => {
    reset(); const token = turn.current;
    historyLoadingRef.current = true; setHistoryLoading(true);
    try {
      const bound = item.workoutTarget;
      const matches = (target: Row | undefined) => target && target.kind === context?.workoutRef?.kind &&
        (context?.workoutRef?.planId ? target.planId === context.workoutRef.planId : true) &&
        (target.kind === 'plan' ? target.workoutId === context?.workoutRef.workoutId : target.kind === 'adhoc' ? target.plannedWorkoutId === context?.workoutRef.plannedWorkoutId : true);
      if (capability === 'workout_chat' && !matches(bound)) {
        throw new Error('Open this workout from Training to continue its chat.');
      }
      const rows = await readMessages(item.id);
      if (token !== turn.current) return;
      conversation.current = item.id; setMessages(rows); setShowHistory(false);
      if (tab) setHandoffReady(true);
      // Recover a durable proposal only through its completed assistant turn.
      if (capability === 'workout_chat') {
        const last = rows.at(-1);
        if (last?.role === 'assistant' && last.draftId) {
          const doc = await db.collection('players').doc(playerId).collection('workoutDrafts').doc(last.draftId).get({ source: 'server' });
          const d = doc.data();
          const lastUser = [...rows].reverse().find(r => r.role === 'user');
          if (token === turn.current && d?.status === 'proposed' && d.check?.ok === true && d.createdByUid === auth.currentUser?.uid &&
              d.playerId === playerId && d.conversationId === item.id && matches(d.target) &&
              (bound.kind !== 'new' || bound.weekNumber === d.target.weekNumber) && last.createdAt &&
              d.sourceMessageId === lastUser?.id && d.expiresAt?.toMillis?.() > Date.now()) onDraft?.({ ...d, draftId: doc.id });
        }
      }
    } catch (e: any) { if (token === turn.current) { if (tab) setTranscriptError(e.message); else setError(e.message); } }
    finally { if (token === turn.current) { historyLoadingRef.current = false; setHistoryLoading(false); } }
  };

  const send = async (text: string, memoryAction?: Row) => {
    if (!canChat || controller.current || historyLoadingRef.current || (!memoryAction && !text.trim())) return;
    const token = ++turn.current;
    controller.current = new AbortController(); setSending(true); setError(''); setErrorCode(''); setAnswer(''); onDraft?.(null);
    const optimistic: Row = { role: 'user', content: text };
    if (tab) {
      setErrorRequest(''); setStatus(''); setTranscriptError('');
      if (memoryAction) { setMemoryBusy(true); setMemoryNotice(''); }
      else {
        setHandoffReady(false);
        if (canPlayRunner) { runnerIntroPlayed.current = true; setRunnerPass(++runnerCount.current); }
      }
    }
    if (!memoryAction) { setDraft(''); setMessages(rows => [...rows, optimistic]); }
    let full = '', proposal: Row | null = null, memorySnapshot: Row | null = null, handoff: Row | null = null;
    try {
      if (preview) {
        // The preview never calls the coach. On the Coach tab it pauses like a reply would, so Stop can be tried.
        if (tab && !memoryAction) await new Promise<void>((resolve, reject) => {
          const signal = controller.current!.signal, timer = setTimeout(resolve, 1500);
          signal.addEventListener('abort', () => { clearTimeout(timer); reject(Object.assign(new Error('Stopped'), { name: 'AbortError' })); }, { once: true });
        });
        if (token !== turn.current) return;
        if (memoryAction) {
          setMemory({ workspace: { schemaVersion: 1, revision: (memory?.workspace.revision || 0) + 1, enabled: memoryAction.enabled ?? memory?.workspace.enabled ?? true }, memories: [] });
          if (tab && memoryAction.kind !== 'list') setMemoryNotice('Updated.');
        } else {
          setMessages(rows => [...rows, { role: 'assistant', content: 'This is a local preview. Your signed-in coach uses your results, training plan and the preferences you choose to save.' }]);
          if (capability === 'pose_chat') setMessages(rows => [...rows.slice(0, -1), { id: `sample-${Date.now()}`, role: 'assistant', content: 'Let’s prepare a session around your request. You can review and change it in Training before publishing.', workoutRequest: { type: 'workout_request', playerId, request: text, destination: personalStore?.enabled ? 'personal_workout' : 'workout_builder' } }]);
          if (tab) setHandoffReady(true);
        }
        return;
      }
      await streamCoach({ capability, playerId, message: text,
        ...(conversation.current ? { conversationId: conversation.current } : {}),
        context: { ...context, ...(workspace ? { coachWorkspaceVersion: 1 } : {}), ...(workspace && personalStore?.enabled ? { personalWorkoutFlowVersion: 1 } : {}), ...(memoryAction ? { memoryAction } : {}) },
      }, controller.current.signal, frame => {
        if (token !== turn.current) return;
        if (frame.event === 'start' && !memoryAction) conversation.current = frame.data.conversationId;
        if (frame.event === 'delta') { full += frame.data.text || ''; setAnswer(full); if (tab) setStatus(''); }
        if (frame.event === 'tool') setStatus(tab ? (frame.data.status === 'finished' ? '' : coachToolPhrase(frame.data.name))
          : coachToolStatus(frame.data.name, frame.data.status === 'finished'));
        if (frame.event === 'draft') proposal = frame.data;
        if (frame.event === 'memory') memorySnapshot = frame.data;
        if (frame.event === 'workout_request' || frame.data.type === 'workout_request') handoff = frame.data;
      });
      if (token !== turn.current) return;
      // A memory command is complete only with the snapshot it changed (`requireStreamCompletion`).
      if (tab && memoryAction && !memorySnapshot) throw Object.assign(new Error('The response stopped before completion. Refresh to check the saved state.'), { code: 'provider_error' });
      if (memorySnapshot) setMemory(old => (memorySnapshot!.workspace?.revision >= (old?.workspace?.revision || 0) ? memorySnapshot : old));
      if (tab && memoryAction && memoryAction.kind !== 'list') setMemoryNotice('Updated.');
      if (!memoryAction) {
        const rows = conversation.current ? await readMessages(conversation.current) : [];
        if (token !== turn.current) return;
        setMessages(rows.length ? rows : [...messages, { role: 'user', content: text }, { role: 'assistant', content: full, workoutRequest: handoff }]);
        onDraft?.(proposal && (proposal as Row).check?.ok === true ? proposal : null);
        if (tab) setHandoffReady(true);
      }
      setAnswer('');
    } catch (e: any) {
      if (token === turn.current) {
        const stopped = e.name === 'AbortError';
        if (tab) {
          // As the app: a stopped or failed reply leaves no partial answer and no optimistic turn,
          // a stop shows nothing, and only an AI-sharing refusal keeps the words for "and send".
          setAnswer('');
          if (!memoryAction) {
            setMessages(rows => rows.filter(row => row !== optimistic));
            if (e.code === 'ai_consent_required') setDraft(old => old.trim() ? old : text);
            const saved = conversation.current;
            if (saved) void readMessages(saved).then(rows => { if (token === turn.current && rows.length) setMessages(rows); }).catch(() => {});
          }
          if (!stopped) { setError(e.message || 'Something went wrong.'); setErrorCode(typeof e.code === 'string' ? e.code : ''); setErrorRequest(typeof e.requestId === 'string' ? e.requestId : ''); }
        } else {
          setError(stopped ? 'Reply stopped. Check the saved conversation before sending again.' : e.message);
          setErrorCode(typeof e.code === 'string' ? e.code : '');
          if (!memoryAction) setDraft(text);
        }
      }
      if (token === turn.current) onDraft?.(null);
    } finally {
      if (token === turn.current) { controller.current = null; setSending(false); setStatus(''); if (tab) setMemoryBusy(false); }
    }
  };
  const memoryCommand = (kind: string, extra: Row = {}) => void send('', { kind, ...(kind !== 'list' ? { expectedRevision: memory?.workspace.revision } : {}), ...extra });

  if (!tab) return <section className="player-chat" aria-busy={sending || historyLoading}>
    <div className="player-actions">
      <button type="button" disabled={historyLoading} onClick={() => setShowHistory(v => !v)}>History</button>
      <button type="button" onClick={reset}>New conversation</button>
      {workspace && <button type="button" disabled={historyLoading} onClick={() => { setShowMemory(v => !v); memoryCommand('list'); }}>Coach memory</button>}
    </div>
    {showHistory && <section className="portal-card"><h2>Conversations</h2>{history.length ? history.map(item => <button className="player-list-button" key={item.id} disabled={historyLoading} onClick={() => void openHistory(item)}>{item.title || 'Conversation'}<small>{dateText(item.lastMessageAt)}</small></button>) : <p>No conversations yet.</p>}</section>}
    {showMemory && <section className="portal-card"><h2>Coach memory</h2><p>Choose what your coach remembers across conversations.</p>
      {!memory ? <p>Loading memory…</p> : <>
        <label><input type="checkbox" checked={memory.workspace.enabled} disabled={sending} onChange={e => memoryCommand('setEnabled', { enabled: e.target.checked })} /> Use coach memory</label>
        {(memory.memories || []).filter((m: Row) => ['active', 'proposed'].includes(m.status) && (!m.expiresAt || new Date(m.expiresAt).getTime() > Date.now())).map((m: Row) => <article key={m.memoryId} className="player-memory"><small>{m.status === 'proposed' ? 'Suggestion' : 'Saved'} · {String(m.category).replaceAll('_', ' ')}</small><p>{m.text}</p>{m.sourceQuote && <blockquote>{m.sourceQuote}</blockquote>}<div className="player-actions">{m.status === 'proposed' && <button disabled={sending} onClick={() => memoryCommand('confirm', { memoryId: m.memoryId })}>Save</button>}<button disabled={sending} onClick={() => memoryCommand('forget', { memoryId: m.memoryId })}>Forget</button></div></article>)}
        <p>Forgetting stops older chats from recalling these details. Your chat and workout history stay available.</p>
        <button disabled={sending} onClick={() => { if (window.confirm('Forget all saved coach memories and suggestions?')) memoryCommand('forgetAll'); }}>Forget all memories</button>
      </>}
    </section>}
    <div className="player-chat-messages" ref={messageRoot} aria-live="polite">
      {!messages.length && !historyLoading && <div className="player-chat-welcome"><span className="material-symbols-outlined" aria-hidden="true">auto_awesome</span><h2>{capability === 'workout_chat' ? context?.workoutRef?.kind === 'new' ? 'Make a session that fits today.' : 'What would you like to change?' : capability === 'coaching_chat' ? 'Get clear on this drill.' : 'What do you want to work on?'}</h2><p>{capability === 'workout_chat' ? 'Describe your time, equipment, or focus. Review the proposal before saving it.' : 'Ask about your progress, your next session, or a drill.'}</p><div className="player-suggestions">{coachPrompts(capability, context?.workoutRef).map(s => <button type="button" key={s} onClick={() => setDraft(s)}>{s}<span aria-hidden="true">↗</span></button>)}</div><small>Choose a suggestion to edit it before sending.</small></div>}
      {messages.map((m, i) => <article key={m.id || i} className={`chat-message ${m.role === 'user' ? 'user' : 'assistant'}`}><MultilineText text={m.content || ''} />{onHandoff && m.role === 'assistant' && validHandoff(m.workoutRequest, playerId) && (m.workoutRequest.destination === 'personal_workout' && personalStore && athlete ? <CoachPersonalWorkout playerId={playerId} athlete={athlete} preview={preview} store={personalStore} config={config} request={{ ...m.workoutRequest, ...(conversation.current && m.id ? { originConversationId: conversation.current, originMessageId: m.id } : {}) }} reference={m.personalWorkoutProposal} active={active && !sending && !error && i === messages.length - 1} onReview={onHandoff} /> : !sending && !error && i === messages.length - 1 && <button className="primary-cta" onClick={() => onHandoff(m.workoutRequest)}>Continue in Training</button>)}</article>)}
      {answer && <article className="chat-message assistant">{error && <small>Interrupted reply · check history for the saved version</small>}<MultilineText text={answer} /></article>}
      {afterMessages && !sending && <div ref={afterPanel}>{afterMessages}</div>}
      {sending && <p role="status">{status || 'Your coach is thinking…'}</p>}
      {historyLoading && <p role="status">Loading your conversation…</p>}
    </div>
    {error && <div className="player-error" role="alert"><p>{error}</p>{conversation.current && <button type="button" disabled={sending} onClick={() => void openHistory({ id: conversation.current, workoutTarget: context?.workoutRef })}>Load saved conversation</button>}</div>}
    {!canChat && <p>{config ? 'Your coach is temporarily unavailable. Your history is still here.' : 'Connecting to your coach…'}</p>}
    <AISharingControl preview={preview} onAllowed={() => {
      if (['ai_consent_required', 'ai_consent_unavailable'].includes(errorCode)) { setError(''); setErrorCode(''); }
    }} />
    <form className="chat-composer" onSubmit={e => { e.preventDefault(); void send(draft.trim()); }}>
      <textarea aria-label="Message your coach" value={draft} onChange={e => setDraft(e.target.value)} maxLength={capability === 'workout_chat' ? 500 : 2000} placeholder="Message your coach…" rows={2} disabled={sending || historyLoading} />
      <button type="submit" disabled={!canChat || sending || historyLoading || !draft.trim()} aria-label="Send message"><span className="material-symbols-outlined">arrow_upward</span></button>
    </form>
    {sending && <button className="text-button" onClick={() => controller.current?.abort()}>Stop reply</button>}
  </section>;

  // ---- The Coach tab (AICoachTabView, V4) ----
  const memoryAvailable = workspace && canChat;
  const { proposed } = coachMemories(memory);
  const sharingOff = errorCode === 'ai_consent_required';
  const shownError = error ? { message: coachErrorMessage(errorCode), refCode: coachRefCode(errorRequest), sharingOff } : null;
  const canSend = canChat && !sending && !historyLoading && !!draft.trim();
  const last = messages.at(-1);
  const handoff = onHandoff && handoffReady && !sending && last?.role === 'assistant' && validHandoff(last.workoutRequest, playerId) ? last.workoutRequest : null;
  const openSharing = (retry: { resend: boolean; memory: boolean }) => { sharingRetry.current = { allowed: false, ...retry }; setSheet('sharing'); };
  const closeSharing = () => {
    const retry = sharingRetry.current;
    sharingRetry.current = { allowed: false, resend: false, memory: false };
    // The retry runs once the permission sheet is gone (`AISharingOffNotice.resume`).
    setSheet(retry.allowed && retry.memory ? 'memory' : '');
    if (!retry.allowed) return;
    if (sharingOff) clearError();
    if (retry.memory) memoryCommand('list');
    else if (retry.resend && draft.trim()) void send(draft.trim());
  };
  const submit = () => { if (canSend) { void send(draft.trim()); composerInput.current?.blur(); } };
  const toolRow = <div className="coach-tools">
    <CoachHistoryMenu onHistory={() => setSheet('history')} onNew={reset} />
    {memoryAvailable && <button type="button" className="coach-tool" disabled={sending || memoryBusy}
      aria-label={proposed.length ? 'Review coach memory suggestions' : 'Coach memory'}
      onClick={() => { setConfirmForgetAll(false); setSheet('memory'); memoryCommand('list'); }}><MemoryIcon /><span>Memory</span></button>}
    <button type="button" className="coach-tool" onClick={() => openSharing({ resend: false, memory: false })}><SharingIcon /><span>AI sharing</span></button>
  </div>;
  return <section className="player-chat coach-v4" ref={section} aria-busy={sending || historyLoading}>
    <CoachTechniquePage playerId={playerId} preview={preview} reps={technique?.reps ?? []} onReplay={technique?.onReplay ?? (() => {})} />
    <div className="coach-v4-header">
      {toolRow}
      {voiceEnabled && <button type="button" className="coach-voice-mode" onClick={() => setSheet('voice')}>
        <span className="material-symbols-outlined" aria-hidden="true">mic</span>Enter voice mode
      </button>}
      <CoachTechniqueLink />
    </div>
    {config && !canChat && <div className="coach-unavailable">
      <span className="material-symbols-outlined" aria-hidden="true">forum</span>
      <h2>{config.unavailable ? 'Chat settings could not be loaded' : "Chat isn't available in this build"}</h2>
      <p>{config.unavailable ? 'Check your connection. Chat comes back as soon as its settings load.' : "There's no gateway configured for coaching chat right now."}</p>
    </div>}
    {canChat && <>
      <div className="coach-v4-transcript">
        {!messages.length && !streaming && (historyLoading ? <LoadingRow text="Loading your conversation…" />
          : <article className="v4-card coach-v4-card"><p className="coach-v4-label">POSETEK COACH</p><p className="coach-v4-greeting">{coachGreeting([athlete?.firstName, athlete?.lastName].filter(Boolean).join(' ') || athlete?.name)}</p></article>)}
        {messages.map((m, i) => <article key={m.id || i} className={`v4-card coach-v4-message ${m.role === 'user' ? 'user' : 'assistant'}`}>
          <p className="coach-v4-label">{m.role === 'user' ? 'YOU' : 'POSETEK COACH'}</p>
          <div className="coach-v4-text">{m.role === 'user' ? <MultilineText text={m.content || ''} /> : <CoachReplyText text={m.content || ''} />}</div>
        </article>)}
        {streaming && <article className="v4-card coach-v4-message assistant">
          {answer ? <><p className="coach-v4-label">POSETEK COACH</p><div className="coach-v4-text"><CoachReplyText text={answer} /></div></> : <LoadingRow text="Working on it…" />}
        </article>}
        {handoff && <button type="button" className="primary-cta coach-build" onClick={() => onHandoff!(handoff)}>
          {handoff.destination === 'program_intake' ? 'Set up my program' : 'Build this workout'}
        </button>}
      </div>
      <div className="coach-v4-bottom">
        {streaming && status && <p className="coach-tool-row" role="status"><span className="coach-spinner" aria-hidden="true" />{status}</p>}
        {shownError && (shownError.sharingOff
          ? <div className="coach-banner coach-banner-sharing" role="alert">
            <SharingOffNotice action={draft.trim() ? 'send' : undefined} onTurnOn={() => openSharing({ resend: !!draft.trim(), memory: false })} />
            <button type="button" className="coach-dismiss" aria-label="Dismiss" onClick={clearError}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
          </div>
          : <div className="coach-banner coach-banner-error" role="alert">
            <span className="material-symbols-outlined coach-banner-icon" aria-hidden="true">warning</span>
            <div><p>{shownError.message}</p>{shownError.refCode && <p className="coach-ref" aria-label={`Reference code ${[...shownError.refCode].join(' ')}`}>Ref {shownError.refCode}</p>}</div>
            <button type="button" className="coach-dismiss" aria-label="Dismiss error" onClick={clearError}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
          </div>)}
        {transcriptError && !error && <p className="coach-transcript-error">{transcriptError}</p>}
        <div className="coach-v4-composer-wrap">
          {canPlayRunner && runnerPass !== null && <CoachRunner key={runnerPass} pass={runnerPass} onFinished={pass => setRunnerPass(current => (current === pass ? null : current))} />}
          <form className="chat-composer coach-v4-composer" onSubmit={e => { e.preventDefault(); submit(); }}>
            <textarea ref={composerInput} aria-label="Tell me what you need…" placeholder="Tell me what you need…" rows={1} value={draft} maxLength={2000}
              disabled={historyLoading} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.blur(); }} />
            {voiceEnabled && <button type="button" className="coach-mic" aria-label="Enter voice mode" onClick={() => setSheet('voice')}>
              <span className="material-symbols-outlined" aria-hidden="true">mic</span>
            </button>}
            {streaming
              ? <button type="button" className="coach-send" aria-label="Stop" onClick={() => controller.current?.abort()}><span className="material-symbols-outlined coach-stop" aria-hidden="true">stop</span></button>
              : <button type="submit" className="coach-send" aria-label="Send" disabled={!canSend}><SendIcon /></button>}
          </form>
        </div>
      </div>
    </>}
    {sheet === 'history' && <CoachSheet title="History" onDone={() => setSheet('')}>
      {historyStatus === 'loading' && !history.length ? <div className="coach-sheet-center"><span className="coach-spinner coach-spinner-large" role="status" aria-label="Loading" /></div>
        : !history.length ? <div className="coach-sheet-center coach-history-empty">
          <span className="material-symbols-outlined" aria-hidden="true">history</span>
          <p>{historyStatus === 'failed' ? "Couldn't load past conversations" : 'No conversations yet'}</p>
        </div>
        : <div className="coach-history-list">{history.map(item => <button type="button" className="coach-history-row" key={item.id} disabled={historyLoading}
          onClick={() => { setSheet(''); void openHistory(item); }}>
          <strong>{typeof item.title === 'string' && item.title.trim() ? item.title : 'Conversation'}</strong>
          {conversationDate(item.lastMessageAt) && <small>{conversationDate(item.lastMessageAt)}</small>}
        </button>)}</div>}
    </CoachSheet>}
    {sheet === 'memory' && memoryAvailable && <CoachSheet title="Coach memory" onDone={() => { setConfirmForgetAll(false); setSheet(''); }}>
      <CoachMemoryPanel memory={memory} updating={memoryBusy} streaming={streaming} notice={memoryNotice} error={shownError}
        confirmingForgetAll={confirmForgetAll} onConfirmForgetAll={setConfirmForgetAll} onCommand={memoryCommand}
        onRefresh={() => { clearError(); memoryCommand('list'); }} onTurnOnSharing={() => openSharing({ resend: false, memory: true })} />
    </CoachSheet>}
    {sheet === 'sharing' && <CoachSheet title="AI sharing" onDone={closeSharing}>
      <AISharingControl preview={preview} onAllowed={() => { sharingRetry.current.allowed = true; }} />
    </CoachSheet>}
    {sheet === 'voice' && <CoachSheet title="Voice mode" onDone={() => setSheet('')}>
      <p className="coach-voice-note">Voice mode is available in the PoseTek iPhone app.</p>
    </CoachSheet>}
  </section>;
}
