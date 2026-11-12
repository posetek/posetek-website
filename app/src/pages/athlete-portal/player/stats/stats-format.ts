import type { Row } from '../execution';

/** `PlayerPosition.label` (KickAI/Admin/PlayerProfileFields.swift). Any other stored value is no position. */
const POSITION_LABELS: Record<string, string> = {
  GK: 'Goalkeeper', CB: 'Centre back', FB: 'Full back / wing back', DM: 'Defensive midfielder',
  CM: 'Central midfielder', AM: 'Attacking midfielder', W: 'Winger', ST: 'Striker',
};
export const positionLabel = (raw: unknown): string | null => typeof raw === 'string' && Object.hasOwn(POSITION_LABELS, raw) ? POSITION_LABELS[raw] : null;

/** `Date.formatted(date: .abbreviated, time: .omitted)` in US English: "Nov 1, 2026". */
export function reportDate(millis: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...(timeZone ? { timeZone } : {}) }).format(new Date(millis));
}

const measurement = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

/** `PoseDataStore.cmToFeetInches`: whole feet and whole (truncated) inches, `5'10"`; `--` when absent. */
export function bodyHeightText(heightCm: unknown): string {
  const cm = measurement(heightCm);
  if (cm === null) return '--';
  const inches = cm / 2.54;
  return `${Math.trunc(inches / 12)}'${Math.trunc(inches % 12)}"`;
}

/** The player document stores kilograms; the body-scan card shows `"%.0f lbs"`; `--` when absent. */
export function bodyWeightText(weightKg: unknown): string {
  const kg = measurement(weightKg);
  return kg === null ? '--' : `${(kg * 2.20462).toFixed(0)} lbs`;
}

// MARK: - Session summary (KickAI/CoachView/CoachPlayerView/CoachProfileSessionStatsStore.swift)

export type SessionSummary = { id: string; type: string; repCount: number; date: Date | null };

const dateOf = (value: unknown): Date | null => {
  const stamp = value as { toDate?: () => Date } | null | undefined;
  if (stamp && typeof stamp.toDate === 'function') return stamp.toDate();
  return value instanceof Date ? value : null;
};

/** `parsePlayerSessionDocument`: a session needs a type; the date is `timestamp`, else `createdAt`. */
export function parseSession(id: string, data: Row): SessionSummary | null {
  const type = typeof data.sessionType === 'string' ? data.sessionType : typeof data.drillType === 'string' ? data.drillType : '';
  if (!type) return null;
  const repCount = typeof data.repCount === 'number' && Number.isFinite(data.repCount) ? Math.trunc(data.repCount) : 0;
  return { id, type, repCount, date: dateOf(data.timestamp) ?? dateOf(data.createdAt) };
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** `recordingStreakDays`: consecutive recorded days ending at the latest day not after today; 0 after a gap of more than a day. */
export function recordingStreakDays(sessions: SessionSummary[], now = new Date()): number {
  const days = new Set(sessions.flatMap(session => session.date ? [startOfDay(session.date).getTime()] : []));
  const today = startOfDay(now).getTime();
  const eligible = [...days].filter(day => day <= today);
  if (!eligible.length) return 0;
  const latest = Math.max(...eligible);
  if (Math.round((today - latest) / 86_400_000) > 1) return 0;
  let streak = 0;
  const cursor = new Date(latest);
  while (days.has(cursor.getTime())) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

/** `CoachProfileSessionAnalytics.displayName(forRawType:)`. */
export function sessionDisplayName(raw: string): string {
  const value = raw.trim();
  if (!value) return raw;
  switch (value.toLowerCase()) {
    case 'jump': return 'Jump';
    case 'sprint': return 'Sprint';
    case 'deadballshot': case 'side_kick': return 'Shooting';
  }
  const capitalized = (part: string) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase();
  return value.includes(' ') || value.includes('_') ? value.replaceAll('_', ' ').split(' ').filter(Boolean).map(capitalized).join(' ') : capitalized(value);
}

/** `favoriteDrill(from:)`: the type with the most reps (`max(repCount, 1)` per session); ties go to the later label. */
export function favoriteDrill(sessions: SessionSummary[]): { displayName: string; repTotal: number } | null {
  const tally = new Map<string, { label: string; reps: number }>();
  for (const session of sessions) {
    const trimmed = session.type.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase(), add = Math.max(session.repCount, 1), existing = tally.get(key);
    tally.set(key, existing ? { label: existing.label, reps: existing.reps + add } : { label: sessionDisplayName(trimmed), reps: add });
  }
  let winner: { label: string; reps: number } | null = null;
  for (const entry of tally.values()) {
    if (!winner || entry.reps > winner.reps || (entry.reps === winner.reps && winner.label < entry.label)) winner = entry;
  }
  return winner ? { displayName: winner.label, repTotal: winner.reps } : null;
}

export type SessionTiles = { streak: string; total: string; favorite: string; favoriteCaption: string | null };

/** The three `V4MetricTile` values under the body scan, including the store's loading and empty states. */
export function sessionTiles(sessions: SessionSummary[] | null, now = new Date()): SessionTiles {
  if (sessions === null) return { streak: '…', total: '…', favorite: '…', favoriteCaption: null };
  const favorite = favoriteDrill(sessions);
  return {
    streak: `${recordingStreakDays(sessions, now)} days`,
    total: String(sessions.length),
    favorite: favorite?.displayName ?? '—',
    favoriteCaption: favorite ? favorite.repTotal === 1 ? '1 rep' : `${favorite.repTotal} reps` : sessions.length ? null : 'No sessions yet',
  };
}

// MARK: - Skill map (KickAI/Stats/AthleteStatsComponents.swift, `AthleteRadarChart`)

/** The app's axis order (`AthleteSkillAxis.allCases`). */
export const RADAR_ORDER = ['power', 'speed', 'agility', 'ballControl', 'striking'] as const;
export const RADAR_CEILING = 130;

/** The chart's plot radius for a frame: the labels need 62 px beside and 36 px above and below. */
export function radarRadius(width: number, height: number): number {
  return Math.max(44, Math.min(width / 2 - 62, height / 2 - 36));
}

export const radarAngle = (index: number, count: number) => (2 * Math.PI / Math.max(count, 1)) * index - Math.PI / 2;

export function radarPoint(cx: number, cy: number, radius: number, index: number, count: number, ratio: number) {
  const angle = radarAngle(index, count), r = radius * Math.max(0, Math.min(ratio, 1));
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** Taps nearer than 24 px to the center select nothing; otherwise the nearest spoke by angle. */
export function nearestRadarAxis(dx: number, dy: number, count: number): number | null {
  if (Math.hypot(dx, dy) <= 24) return null;
  const tap = Math.atan2(dy, dx);
  const distance = (a: number, b: number) => { const diff = Math.abs(a - b) % (2 * Math.PI); return Math.min(diff, 2 * Math.PI - diff); };
  let best = 0;
  for (let index = 1; index < count; index += 1) if (distance(tap, radarAngle(index, count)) < distance(tap, radarAngle(best, count))) best = index;
  return best;
}
