// Invented browser-local Firebase stand-in for the parent-accounts acceptance fixture. Never
// imported by a production entry. The scenario comes from `?as=` (the restored signed-in account)
// and every callable is recorded in `window.__parentFixture.calls`.
type Data = Record<string, unknown>;
type Listener = (user: unknown) => void;

const CODE = 'PAR-' + '0123456789ABCDEF'.repeat(2);
const accounts: Record<string, { uid: string; email: string; club?: string }> = {
  parent: { uid: 'synthetic-parent', email: 'parent@example.test' },
  child: { uid: 'synthetic-child-login', email: 'child@example.test' },
  'other-player': { uid: 'synthetic-other-login', email: 'other@example.test' },
  coach: { uid: 'synthetic-coach', email: 'coach@example.test', club: 'coach' },
  admin: { uid: 'synthetic-admin', email: 'synthetic.admin@posetek.net' },
  unlinked: { uid: 'synthetic-unlinked', email: 'unlinked@example.test' },
};
const players: Record<string, Data> = {
  'child-a': { firstName: 'Avery', lastName: 'Synthetic', guardianUIDs: ['synthetic-parent'] },
  'child-b': { firstName: 'Bea', lastName: 'Synthetic', authenticationUID: 'synthetic-child-login', userUID: 'synthetic-child-login' },
  'other-child': { firstName: 'Olly', lastName: 'Synthetic', authenticationUID: 'synthetic-other-login', userUID: 'synthetic-other-login' },
};
const guardians: Record<string, Data> = { 'synthetic-parent': { schemaVersion: 1, userUID: 'synthetic-parent', playerIds: ['child-a'] } };

const calls: { name: string; data: unknown }[] = [];
// `?paused=1`: the server's emergency switch is on (redemption-disabled).
const paused = new URLSearchParams(location.search).get('paused') === '1';
const fixture = { calls, code: CODE, accountsCreated: 0 };
(window as unknown as { __parentFixture: typeof fixture }).__parentFixture = fixture;

const listeners = new Set<Listener>();
function makeUser(key: string) {
  const account = accounts[key];
  return { uid: account.uid, email: account.email, emailVerified: true, isAnonymous: false, providerData: [{ providerId: 'password' }],
    reload: async () => {}, getIdToken: async () => 'synthetic',
    getIdTokenResult: async () => ({ claims: { sub: account.uid, email: account.email, email_verified: true } }) };
}
let current: ReturnType<typeof makeUser> | null = null;
const restored = new URLSearchParams(location.search).get('as');
if (restored && accounts[restored]) current = makeUser(restored);
const notify = () => listeners.forEach(listener => listener(current));

export const auth = {
  get currentUser() { return current; },
  onAuthStateChanged(listener: Listener) { listeners.add(listener); setTimeout(() => listener(current)); return () => { listeners.delete(listener); }; },
  async signInWithEmailAndPassword(email: string) {
    const key = Object.keys(accounts).find(name => accounts[name].email === email);
    if (!key) throw Object.assign(new Error('invalid'), { code: 'auth/invalid-credential' });
    current = makeUser(key); notify();
    return { user: current };
  },
  async signOut() { current = null; notify(); },
  async createUserWithEmailAndPassword() { fixture.accountsCreated++; throw Object.assign(new Error('exists'), { code: 'auth/email-already-in-use' }); },
  async sendPasswordResetEmail() {},
};

const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
function document(collection: string, id: string) {
  return { get: async () => {
    if (collection === 'guardians' && id !== current?.uid) throw denied();
    const row = collection === 'players' ? players[id] : collection === 'guardians' ? guardians[id] : undefined;
    return { id, exists: !!row, data: () => row, ref: { update: async () => {} } };
  }, update: async () => {}, collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }), onSnapshot: () => () => {} };
}
export const db = { collection: (name: string) => ({
  doc: (id: string) => document(name, id),
  where: (field: string, _op: string, value: unknown) => ({ limit: () => ({ get: async () => {
    const docs = name === 'players' ? Object.entries(players).filter(([, row]) => row[field] === value).map(([id, row]) => ({ id, exists: true, data: () => row, ref: { update: async () => {} } })) : [];
    return { empty: docs.length === 0, docs };
  } }) }),
}) };

const answers: Record<string, (data: Data) => unknown> = {
  // Only the fixture's open code is unused; any other well-formed code reads as used.
  validateGuardianInvitation: data => paused ? { valid: false, reason: 'redemption-disabled' } : { valid: data.code === CODE },
  redeemGuardianInvitation: data => {
    if (!current) throw Object.assign(new Error('Sign in'), { code: 'functions/unauthenticated' });
    if (paused) throw Object.assign(new Error('paused'), { code: 'functions/failed-precondition', details: { reason: 'redemption-disabled' } });
    if (current.uid !== 'synthetic-parent' && current.uid !== 'synthetic-unlinked') throw Object.assign(new Error('refused'), { code: 'functions/failed-precondition', details: { reason: 'player-login' } });
    return data.code === CODE ? { playerIds: ['child-a'], addedPlayerIds: [] } : (() => { throw Object.assign(new Error('used'), { code: 'functions/not-found' }); })();
  },
  getClubContext: () => {
    const club = Object.values(accounts).find(account => account.uid === current?.uid)?.club;
    return club ? { role: club, organization: { id: 'synthetic-club', name: 'Synthetic Club' }, organizations: [], teams: [], staff: [], invitations: [], players: [] } : { role: 'none', organization: null, organizations: [], teams: [], staff: [], invitations: [], players: [] };
  },
  getAthletePlatformTime: data => ({ playerId: data.playerId, totalMinutes: 125, status: 'available', collectionStartedAtMillis: null }),
  getPlayerGuardians: data => ({ playerId: data.playerId, issuingEnabled: true, invitation: null, siblingCandidates: [],
    guardians: [{ uid: 'synthetic-parent', email: 'parent@example.test', linkedAtMillis: null, playerIds: ['child-a'] }] }),
};
export const cloud = { httpsCallable: (name: string) => async (data: Data = {}) => {
  calls.push({ name, data });
  const answer = answers[name];
  if (!answer) throw Object.assign(new Error(`Synthetic fixture has no ${name}`), { code: 'functions/unavailable' });
  return { data: answer(data) };
} };
export const storage = {};
const firebase = {
  auth: Object.assign(() => auth, { EmailAuthProvider: { credential: () => ({}) } }),
  firestore: { FieldValue: { serverTimestamp: () => null } },
};
export default firebase;
