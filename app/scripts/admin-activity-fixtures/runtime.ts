// Invented browser-local records. This module is never imported by production.
// Keep the actual report transport, validation, identity and retry hooks in use.
import { PREVIEW_CHOICES, previewInsights } from '/src/pages/insights/lib/preview';
import { expandedRequest } from '/src/pages/insights/lib/expandedQuery';
import { requestFromWorkspacePayload } from '/src/pages/admin/lib/workspaceMetricsData';

export const AS_OF = Date.parse('2026-11-03T18:00:00Z');
const options = window.__adminActivityOptions || {};
const listeners = new Set();
const requests = [], pending = [];
let sequence = 0, hold = false, reportMode = options.reportMode || 'normal';
const account = uid => uid ? { uid, email: `${uid}@example.test`, emailVerified: true, isAnonymous: false } : null;
export const auth = {
  currentUser: account('synthetic-admin-one'),
  onAuthStateChanged(listener) { listeners.add(listener); queueMicrotask(() => listeners.has(listener) && listener(auth.currentUser)); return () => { listeners.delete(listener); }; },
};
const fail = (message, code = 'failed-precondition') => Object.assign(new Error(message), { code });
const deny = name => { const message = `Unmocked or mutating access is forbidden: ${name}`; window.__adminActivity.denied.push(message); throw fail(message); };
function log(kind, input) { const entry = { sequence: ++sequence, kind, input: structuredClone(input), uid: auth.currentUser?.uid || null, state: 'started' }; requests.push(entry); return entry; }
async function read(kind, input, reader) {
  const entry = log(kind, input);
  try { const data = await reader(entry); entry.state = 'resolved'; return data; }
  catch (error) { entry.state = 'rejected'; entry.code = error.code; throw error; }
}
window.__adminActivity = {
  requests, pending, denied: [],
  setAccount(uid) { auth.currentUser = account(uid); for (const listener of listeners) listener(auth.currentUser); },
  setReportMode(value) { reportMode = value; },
  holdNextReport() { hold = true; },
  releaseReports() { for (const item of pending.splice(0)) item.resolve(item.value); },
};

const allRequest = { ...expandedRequest('?start=2026-10-07&end=2026-11-03'), orgId: '', teamId: '' };
const allBase = Array.from({ length: 4 }, (_, page) => previewInsights(allRequest, page, 'longNames').players).flat();
export const organizations = PREVIEW_CHOICES.organizations.map(org => ({ id: org.id, name: org.name, code: org.id.toUpperCase(), schemaVersion: 2, coachIds: [], logoUrl: null }));
const teams = PREVIEW_CHOICES.organizations.flatMap(org => org.teams.map(team => ({ ...team, organizationId: org.id, status: 'active', coachUIDs: [], playerIds: allBase.filter(row => row.teamId === team.id).map(row => row.id) })));
function people(uid = auth.currentUser?.uid) {
  return allBase.map(row => ({ id: row.id, name: `${uid === 'synthetic-admin-two' ? 'Second account ' : ''}${row.firstName} ${row.lastName}`, email: `${row.id}@example.test`, coachId: null,
    organizationId: row.organizationId, teamId: row.teamId, registered: true, signupCode: null,
    raw: { firstName: row.firstName, lastName: row.lastName, organizationId: row.organizationId, teamId: row.teamId, birthDate: '2012-01-01' } }));
}
function context(id) {
  return { role: 'admin', organizations: organizations.map(org => ({ ...org, status: 'active' })), organization: organizations.find(org => org.id === id) || null,
    teams: teams.filter(team => team.organizationId === id), staff: [], invitations: [],
    players: people().filter(row => row.organizationId === id).map(row => ({ id: row.id, ...row.raw, canIssueSignupCode: false })) };
}
export const directorySource = {
  organizations: () => read('organizations', {}, () => organizations),
  roster: org => read('roster', { organizationId: org.id }, () => ({ players: people().filter(row => row.organizationId === org.id), context: context(org.id), notices: ['Synthetic acceptance fixture. No real accounts or records.'] })),
  context: id => read('context', { organizationId: id }, () => context(id)),
  coaches: () => read('coaches', {}, () => []), teams: () => read('teams', {}, () => teams),
  lookup: () => read('lookup', {}, () => ({ players: people(), limited: false })),
};

const observedFeatures = [
  { features: ['results'], basis: 'latestInterval' },
  { features: ['training', 'results'], basis: 'latestInterval' },
  { features: ['overview'], basis: 'window' },
  { features: ['training', 'overview'], basis: 'window' },
];

function extended(row, cutoff, uid, includeLastFeatureEvidence) {
  const index = Number(row.id.replace('synthetic-', ''));
  const windowEnd = cutoff - (index % 8) * 900_000;
  const lastActivityWindow = row.usage.collected && row.usage.activeMinutes > 0
    ? { startMillis: windowEnd - 900_000, endMillis: windowEnd,
      ...(includeLastFeatureEvidence ? { featureEvidence: observedFeatures[index % observedFeatures.length] } : {}) }
    : null;
  const signInStatus = ['unknown', 'none', 'recorded', 'unlinked'][index % 4];
  const latest = row.workouts.started ? { source: index % 2 ? 'personalWorkoutLogs' : 'workoutLogs', logId: `fixture-${index}-first`, title: `Synthetic session ${index}`,
    startedAtMillis: AS_OF - (index + 1) * 3_600_000, endedAtMillis: row.workouts.status === 'inProgress' ? null : AS_OF - (index + 1) * 3_600_000 + 1_800_000,
    status: row.workouts.status, timerMinutes: row.workouts.timerRecords ? row.workouts.timerMinutes : null, estimatedMinutes: row.workouts.estimatedRecords ? row.workouts.estimatedMinutes : null, setsCompleted: 2 } : null;
  const assigned = index % 7 === 0 ? { status: 'unavailable', weekNumber: null, remaining: null, notStarted: null, noEnding: null }
    : index % 6 === 0 ? { status: 'noActivePlan', weekNumber: null, remaining: null, notStarted: null, noEnding: null }
      : { status: 'available', weekNumber: 2, remaining: index % 3, notStarted: index % 3 ? 1 : 0, noEnding: index % 3 > 1 ? 1 : 0 };
  const label = index === 46 ? ['Zara', 'Complete Roster Leader'] : [row.firstName, row.lastName];
  const copy = { ...row, firstName: `${uid === 'synthetic-admin-two' ? 'Second account ' : ''}${label[0]}`, lastName: label[1],
    usage: { ...row.usage }, workouts: { ...row.workouts },
    adminReporting: { signIn: { status: signInStatus, lastSignInAtMillis: signInStatus === 'recorded' ? AS_OF - 86_400_000 : null },
      usage: { lastActivityWindow },
      workouts: { latest }, assigned } };
  if (index === 46) { copy.workouts.timerMinutes = 137; copy.workouts.timerRecords = 3; copy.usage = { ...copy.usage, collected: true, webCollected: true, iosCollected: true, activeMinutes: 201, webMinutes: 151, iosMinutes: 65, activeDays: 8 }; }
  return copy;
}
const matchFollowUp = (row, followUp) => followUp === 'active' ? row.usage.collected && row.usage.activeMinutes > 0
  : followUp === 'noSignIn' ? ['none', 'unlinked'].includes(row.adminReporting.signIn.status)
  : followUp === 'noActivity' ? row.usage.collected && row.usage.activeMinutes === 0
    : followUp === 'unfinishedAssigned' ? row.adminReporting.assigned.status === 'available' && row.adminReporting.assigned.remaining > 0
      : followUp === 'noCompletion' ? row.workouts.completed === 0 : true;
function report(payload, uid) {
  const request = { ...requestFromWorkspacePayload(payload), orgId: payload.scope.organizationId || '', teamId: payload.scope.teamId || '' };
  // The response echoes the selected search even though aggregate population is
  // intentionally calculated before name filtering.
  const original = previewInsights(request, 0, reportMode === 'empty' ? 'empty' : 'longNames');
  const cutoff = Math.floor(Math.min(AS_OF, Date.parse(`${request.endDate}T23:59:59Z`)) / 900_000) * 900_000;
  const population = Array.from({ length: 4 }, (_, page) => previewInsights({ ...request, rosterSearch: '' }, page, reportMode === 'empty' ? 'empty' : 'longNames').players).flat()
    .map(row => extended(row, cutoff, uid, payload.includeLastFeatureEvidence === true));
  const followUp = payload.adminReporting?.followUp || 'all', sort = payload.adminReporting?.sort || 'name';
  const name = row => `${row.firstName} ${row.lastName}`;
  const value = row => sort === 'activeMinutes' ? row.usage.activeMinutes : sort === 'workoutMinutes' ? row.workouts.timerMinutes
    : sort === 'lastActivity' ? row.adminReporting.usage.lastActivityWindow?.endMillis || -1 : sort === 'lastWorkout' ? row.adminReporting.workouts.latest?.startedAtMillis || -1
      : sort === 'unfinishedAssigned' ? row.adminReporting.assigned.remaining ?? -1 : 0;
  const rows = population.filter(row => matchFollowUp(row, followUp) && (!payload.nameSearch || name(row).toLowerCase().includes(payload.nameSearch.toLowerCase())))
    .sort((a, b) => value(b) - value(a) || name(a).localeCompare(name(b)) || a.id.localeCompare(b.id));
  const offset = payload.cursor ? Number(String(payload.cursor).match(/^fixture-page-(\d+)$/)?.[1]) : 0;
  if (!Number.isSafeInteger(offset) || offset < 0) throw fail('Synthetic cursor does not belong to this report.');
  const pageSize = payload.pageSize || 20;
  const total = (values, get) => values.reduce((sum, row) => sum + get(row), 0);
  const byTeam = [...new Set(population.map(row => `${row.organizationId}/${row.teamId || ''}`))].map(key => {
    const group = population.filter(row => `${row.organizationId}/${row.teamId || ''}` === key), first = group[0];
    return { organizationId: first.organizationId, teamId: first.teamId, name: first.teamName || 'Unassigned', players: group.length,
      collectedPlayers: group.filter(row => row.usage.collected).length, activePlayers: group.filter(row => row.usage.collected && row.usage.activeMinutes > 0).length,
      activeMinutes: total(group, row => row.usage.activeMinutes), workoutStarted: total(group, row => row.workouts.started), workoutCompleted: total(group, row => row.workouts.completed),
      signInRecordedPlayers: group.filter(row => row.adminReporting.signIn.status === 'recorded').length, signInNonePlayers: group.filter(row => row.adminReporting.signIn.status === 'none').length,
      signInUnlinkedPlayers: group.filter(row => row.adminReporting.signIn.status === 'unlinked').length, signInUnknownPlayers: group.filter(row => row.adminReporting.signIn.status === 'unknown').length,
      timerMinutes: total(group, row => row.workouts.timerMinutes), estimatedMinutes: total(group, row => row.workouts.estimatedMinutes), timerRecords: total(group, row => row.workouts.timerRecords), estimatedRecords: total(group, row => row.workouts.estimatedRecords) };
  });
  return { ...original, filters: { ...payload.filters }, generatedAtMillis: AS_OF,
    players: rows.slice(offset, offset + pageSize), pagination: { total: rows.length, pageSize, nextCursor: offset + pageSize < rows.length ? `fixture-page-${offset + pageSize}` : null },
    ...(payload.rosterPlayerIds ? { rosterMetrics: payload.rosterPlayerIds.map(playerId => { const player = population.find(row => row.id === playerId); return player ? { playerId, status: 'included', player } : { playerId, status: 'excluded' }; }) } : {}),
    ...(payload.adminReporting && reportMode !== 'missing-extension' ? { adminReporting: { version: 1, followUp, sort, asOfMillis: AS_OF, population: population.length,
      summary: { noSignIn: population.filter(row => matchFollowUp(row, 'noSignIn')).length, noActivity: population.filter(row => matchFollowUp(row, 'noActivity')).length,
        unfinishedAssigned: population.filter(row => matchFollowUp(row, 'unfinishedAssigned')).length, noCompletion: population.filter(row => matchFollowUp(row, 'noCompletion')).length,
        signInUnknown: population.filter(row => row.adminReporting.signIn.status === 'unknown').length, usageNotCollected: population.filter(row => !row.usage.collected).length },
      topActivePlayers: [...population].sort((a, b) => b.usage.activeMinutes - a.usage.activeMinutes).slice(0, 5).map(row => ({ id: row.id, name: name(row), activeMinutes: row.usage.activeMinutes })),
      topWorkoutPlayers: [...population].sort((a, b) => b.workouts.timerMinutes - a.workouts.timerMinutes).slice(0, 5).map(row => ({ id: row.id, name: name(row), timerMinutes: row.workouts.timerMinutes })), teams: byTeam } } : {}),
  };
}

function history(playerId, source) {
  return Array.from({ length: source === 'workoutLogs' ? 2 : 1 }, (_, index) => ({ id: `${playerId}-${source}-${index}`,
    status: index ? 'endedEarly' : 'completed', startedAt: new Date(AS_OF - (index + 1) * 86_400_000), endedAt: new Date(AS_OF - (index + 1) * 86_400_000 + 1_800_000), elapsedSeconds: 1800,
    workoutSnapshot: { title: `Synthetic ${source === 'workoutLogs' ? 'assigned' : 'personal'} session ${index + 1}`, estimatedMinutes: 35,
      blocks: [{ blockId: 'fixture-drill', name: 'Synthetic close-control drill', kind: 'main', sets: 3, reps: 8, repUnit: 'reps', restSeconds: 45, restScope: 'sets' }] },
    blocks: [{ blockId: 'fixture-drill', completed: true, completedSets: 3 }] }));
}
function collection(path) {
  return { doc: id => collection([...path, id]), collection: id => collection([...path, id]),
    async get() {
      if (path.length !== 3 || path[0] !== 'players' || !['workoutLogs', 'personalWorkoutLogs'].includes(path[2])) return deny(path.join('/'));
      return read('history', { playerId: path[1], source: path[2] }, () => ({ docs: history(path[1], path[2]).map(row => ({ id: row.id, data: () => row })) }));
    }, set: () => deny('set'), update: () => deny('update'), delete: () => deny('delete'), add: () => deny('add'), where: () => deny('query'), onSnapshot: () => deny('onSnapshot') };
}
export const db = { collection: id => collection([id]), batch: () => deny('batch'), runTransaction: () => deny('transaction') };
export const storage = { ref: () => deny('storage') };
export const cloud = { httpsCallable: name => async payload => ({ data: await read(name, payload, async entry => {
  if (name === 'getClubInsightsV2') {
    if (reportMode === 'error') throw fail('Synthetic activity read unavailable. Retry this read.', 'unavailable');
    if (reportMode === 'denied') throw fail('Synthetic admin access changed.', 'permission-denied');
    const value = report(payload, entry.uid);
    if (hold) { hold = false; return new Promise(resolve => pending.push({ sequence: entry.sequence, resolve, value })); }
    return value;
  }
  if (name === 'getClubContext') return context(payload.organizationId || 'northfield');
  if (name === 'getWorkoutNotificationStatus') return { settings: { enabled: false, sendEnabled: false, recipient: 'synthetic@example.test', quietMinutes: 15 }, notifications: [],
    activity: { lastActivityAtMillis: AS_OF - 600_000, lastSeenAtMillis: AS_OF - 300_000, lastSignal: 'progress', quietDueAtMillis: null, inactivityNotified: false, blockId: 'fixture-drill', webObserved: true }, observedAtMillis: AS_OF };
  return deny(name);
}) }) };
export default { auth: () => auth, firestore: () => db };
