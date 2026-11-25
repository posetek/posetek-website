// Optional interactive fixture. The ordinary acceptance runtime stays strict.
import * as activity from './runtime';
import { fixtureJourney, fixturePlayerJourneys, fixtureTracking } from '../admin-lightning-fixture.mjs';

// AdminPage uses this synthetic UID in sample mode. Share its history and scope
// with the directory and Insights routes rendered by this interactive entry.
if (activity.auth.currentUser?.uid === 'synthetic-admin-one') window.__adminActivity.setAccount('preview-admin');

export const directorySource = activity.directorySource;
export const storage = activity.storage;
export const auth = Object.assign(activity.auth, {
  signOut: async () => window.__adminActivity.setAccount(null),
});

const drills = [
  { id: 'DEMO-01', name: 'Figure-eight dribble', domain: 'dribbling' },
  { id: 'DEMO-02', name: 'First-touch passing', domain: 'passing' },
  { id: 'DEMO-03', name: 'Short acceleration', domain: 'speed' },
].map(drill => ({ ...drill, schemaVersion: 2, drillId: drill.id, status: 'draft', catalogVersion: 'preview',
  minAge: 12, maxAge: 16, difficultyLevel: 1, equipment: [], howTo: { steps: [] }, dose: {} }));
const seeds = {
  organizations: activity.organizations,
  teams: activity.teams,
  coaches: [],
  drillCatalog: drills,
  drillCatalogMeta: [{ id: 'current', catalogVersion: 'preview' }],
  aiIncidents: [{ id: 'sample-incident', kind: 'failure', capability: 'generate_personalized_plan', code: 'SAMPLE_TIMEOUT',
    message: 'The sample request timed out.', createdAt: new Date(activity.AS_OF), isTest: true, triage: { state: 'new' } }],
  llmJobs: [],
  config: [{ id: 'llm' }], // No generation or activation capabilities in the preview.
};
const emptyPlayerCollections = new Set(['reps', 'aiKickComparisons', 'personalizedPlanDrafts', 'personalizedPlanDraftViews',
  'trainingPlans', 'workoutPlans', 'trainingPlanContexts', 'plannedWorkouts', 'planAdjustments']);
let people;
async function rowsAt(path) {
  if (path === 'players') {
    people ??= directorySource.lookup().then(({ players }) => players.map(row => ({ ...row.raw, id: row.id, email: row.email })));
    return people;
  }
  if (Object.hasOwn(seeds, path)) return seeds[path];
  const [root, , collection] = path.split('/');
  if (root === 'players' && emptyPlayerCollections.has(collection)) return [];
  return null;
}

function fixtureReference(path, filters = [], limit = Infinity) {
  const parts = path.split('/');
  const collection = parts.length % 2 === 1;
  const id = parts.at(-1);
  const original = parts.slice(1).reduce((ref, name, index) => index % 2 ? ref.collection(name) : ref.doc(name), activity.db.collection(parts[0]));
  const child = name => fixtureReference(path + '/' + name);
  const get = async () => {
    const records = await rowsAt(collection ? path : parts.slice(0, -1).join('/'));
    if (!records) return original.get();
    const doc = (id, row) => ({ id, exists: !!row, data: () => row });
    if (!collection) return doc(id, records.find(row => row.id === id));
    const docs = records.filter(row => filters.every(filter => filter(row))).slice(0, limit).map(row => doc(row.id, row));
    return { docs, empty: docs.length === 0, size: docs.length };
  };
  return { ...original, id, get, doc: child, collection: child,
    where(key, operator, value) {
      const filter = row => {
        if (operator === '==') return row[key] === value;
        if (operator === '>=') return row[key] >= value;
        if (operator === '<=') return row[key] <= value;
        if (operator === 'in') return value.includes(row[key]);
        if (operator === 'array-contains') return Array.isArray(row[key]) && row[key].includes(value);
        throw Error('Unimplemented synthetic filter: ' + operator);
      };
      return fixtureReference(path, [...filters, filter], limit);
    },
    orderBy() { return this; }, // Ordered collections in this fixture contain at most one row.
    limit(count) { return fixtureReference(path, filters, count); },
    onSnapshot(next, error) {
      let active = true;
      get().then(snapshot => { if (active) next(snapshot); }, reason => { if (active) error?.(reason); });
      return () => { active = false; };
    },
  };
}

export const db = { ...activity.db, collection: fixtureReference };
const readOnlyCalls = {
  trainingGetDrillAuthoring: () => ({ records: {}, canReview: false }),
  getAthleteEffectiveResults: () => ({ reps: [], provisionalEstimates: [] }),
  trainingGetReadiness: () => ({ canReview: false, readiness: null }),
  getStatsJourney: fixtureJourney,
  getAdminPlayerJourneys: fixturePlayerJourneys,
  getOnePagerEngagement: fixtureTracking,
};
export const cloud = { httpsCallable(name) {
  return Object.hasOwn(readOnlyCalls, name)
    ? async input => ({ data: await readOnlyCalls[name](input) })
    : activity.cloud.httpsCallable(name);
} };
export default { auth: () => auth, firestore: () => db };
