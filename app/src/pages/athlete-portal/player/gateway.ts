import { useEffect, useState } from 'react';
import { auth, db } from '../../../lib/firebase';
import type { Row } from './execution';
import { aiSharingError, assertAIChatEnabled } from './ai-sharing';

export type Frame = { event: string; data: Row };
export function parseFrame(frame: string): Frame | null {
  let event = 'message'; const lines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) lines.push(line.slice(5).trimStart());
  }
  if (!lines.length) return null;
  return { event, data: JSON.parse(lines.join('\n')) };
}

// Shared wire transport for the player workspace and the staff athlete portal.
// Drafts, memory and handoffs stay tentative until the whole turn completes.
export async function streamCoach(body: Row, signal: AbortSignal, onFrame: (frame: Frame) => void): Promise<void> {
  signal.throwIfAborted();
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to speak with your coach.');
  let requestId: string = crypto.randomUUID();
  const current = () => {
    signal.throwIfAborted();
    if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Sign in again before sending.');
  };
  const failure = (payload: Row, fallback: string, httpStatus?: number) => {
    if (typeof payload.requestId === 'string' && payload.requestId) requestId = payload.requestId;
    return Object.assign(aiSharingError(payload.code, payload.message || fallback), {
      requestId, ...(typeof payload.incidentId === 'string' ? { incidentId: payload.incidentId } : {}),
      ...(httpStatus === undefined ? {} : { httpStatus }),
    });
  };
  assertAIChatEnabled(user.uid, body);
  const idToken = await user.getIdToken();
  current();
  assertAIChatEnabled(user.uid, body);
  const response = await fetch('https://us-central1-kickai-69dd0.cloudfunctions.net/aiCoachStreamProxy', {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json', Accept: 'text/event-stream',
      'X-PoseTek-Request-Id': requestId, 'X-PoseTek-Client': 'web/athlete-portal' },
    body: JSON.stringify({ schemaVersion: 1, clientVersion: '1.1+4', ...body, requestId }),
  });
  try { current(); }
  catch (error) { await response.body?.cancel().catch(() => {}); throw error; }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    current();
    throw failure(error?.error && typeof error.error === 'object' ? { ...error, ...error.error } : error || {},
      `Coach unavailable (${response.status}).`, response.status);
  }
  if (!response.body) throw failure({}, 'No reply received. Try again.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', completed = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const apply = (text: string) => {
    if (completed) return;
    current();
    const frame = parseFrame(text); if (!frame) return;
    if (typeof frame.data?.requestId === 'string' && frame.data.requestId) requestId = frame.data.requestId;
    if (frame.event === 'error') throw failure(frame.data, 'The coach could not finish.');
    if (frame.event === 'done') {
      if (frame.data?.finishReason === 'error') throw failure(frame.data, 'The coach could not finish.');
      completed = true;
    }
    onFrame(frame);
  };
  try {
    while (true) {
      current();
      const { done, value } = await reader.read();
      current();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/); buffer = frames.pop() || '';
      for (const frame of frames) { apply(frame); if (completed) break; }
      if (done || completed) break;
    }
    if (!completed && buffer.trim()) apply(buffer);
    if (!completed) throw failure({}, 'The connection ended before the reply was saved. Reopen history or try again.');
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {}); reader.releaseLock();
  }
}

export function capabilityEnabled(config: Row | null, name: string): boolean {
  if (!config || config.globalEnabled === false || config.unavailable) return false;
  const entry = config?.capabilities?.[name];
  if (['workout_chat', 'apply_workout_draft'].includes(name)) return entry?.enabled === true &&
    Number.isInteger(entry.dailyLimitPerUser) && entry.dailyLimitPerUser > 0;
  return entry?.enabled !== false;
}

export function useCoachConfig(preview: boolean) {
  const [config, setConfig] = useState<Row | null>(preview ? { enabled: true, programV3Enabled: true, coachWorkspaceEnabled: true,
    capabilities: Object.fromEntries(['pose_chat', 'workout_chat', 'coaching_chat', 'apply_workout_draft', 'generate_training_plan'].map(k => [k, { enabled: true, dailyLimitPerUser: 3 }])) } : null);
  useEffect(() => {
    if (preview) return;
    return db.collection('config').doc('llm').onSnapshot(d => setConfig(d.data() || {}), () => setConfig({ unavailable: true }));
  }, [preview]);
  return config;
}

export function validHandoff(value: any, playerId: string): boolean {
  return value?.type === 'workout_request' && value.playerId === playerId &&
    typeof value.request === 'string' && !!value.request.trim() && value.request.length <= 500 &&
    ['workout_builder', 'program_intake', 'personal_workout'].includes(value.destination);
}

export function jobProgress(job: Row): string {
  const p = job.progress;
  if (p && typeof p.stage === 'string') {
    const fraction = typeof p.fraction === 'number' ? ` · ${Math.round(Math.max(0, Math.min(1, p.fraction)) * 100)}%` : '';
    return `${p.stage.replaceAll('_', ' ')}${fraction}${p.detail ? ` · ${p.detail}` : ''}`;
  }
  return job.status === 'running' ? 'Building your plan…' : 'Waiting for the training engine…';
}
