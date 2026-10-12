import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { firestoreEmulator, storageEmulator } from './canonicalRules.mjs';

const env = await initializeTestEnvironment({ projectId: 'demo-account-deletion', firestore: firestoreEmulator(), storage: storageEmulator() });
const athlete = env.authenticatedContext('athlete', { email: 'athlete@example.test', email_verified: true });
const admin = env.authenticatedContext('admin', { email: 'staff@posetek.net', email_verified: true });
const coach = env.authenticatedContext('coach', { email: 'coach@example.test', email_verified: true });
let checks = 0;
const denied = async p => { await assertFails(p); checks++; };
const allowed = async p => { await assertSucceeds(p); checks++; };
try {
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'players/player'), { userUID: 'athlete', authenticationUID: 'athlete', organizationId: 'org', teamId: 'team' });
    await setDoc(doc(db, 'organizations/org/members/coach'), { userUID: 'coach', status: 'active', role: 'coach', teamIds: ['team'] });
  });
  const media = c => ref(c.storage(), 'player/sprint/session1/kick1/video.mov');
  for (const c of [athlete, coach, admin]) await allowed(uploadBytes(media(c), new Uint8Array([1]), { contentType: 'video/quicktime' }));
  for (const c of [athlete, coach, admin, env.unauthenticatedContext()]) {
    for (const root of ['accountDeletionJobs', 'accountDeletionLocks', 'playerDeletionLocks', 'accountDeletionReceipts']) {
      await denied(setDoc(doc(c.firestore(), `${root}/forged`), { state: 'completed' }));
      await denied(getDoc(doc(c.firestore(), `${root}/forged`)));
      await denied(deleteDoc(doc(c.firestore(), `${root}/forged`)));
    }
  }
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'accountDeletionLocks/athlete'), { jobId: 'job' });
    await setDoc(doc(c.firestore(), 'playerDeletionLocks/player'), { jobId: 'job' });
    await updateDoc(doc(c.firestore(), 'players/player'), { accountDeletionPending: true });
  });
  await denied(getDoc(doc(athlete.firestore(), 'players/player')));
  for (const c of [athlete, coach, admin]) {
    await denied(uploadBytes(media(c), new Uint8Array([2]), { contentType: 'video/quicktime' }));
    await denied(setDoc(doc(c.firestore(), 'players/player/sessions/late'), { sessionNumber: 1 }));
  }
  await denied(updateDoc(doc(admin.firestore(), 'players/player'), { stats: {}, best_reps: {} }));
  await env.withSecurityRulesDisabled(async c => { await deleteDoc(doc(c.firestore(), 'players/player')); });
  await denied(uploadBytes(media(admin), new Uint8Array([3]), { contentType: 'video/quicktime' }));
  console.log(`${checks} deletion access assertions passed.`);
} finally { await env.cleanup(); }
