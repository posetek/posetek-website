import { useId, useState } from 'react';
import firebase, { auth, cloud } from '../../../../lib/firebase';
import { accountError, authErrorCode } from '../../../landing/account-entry';
import { DELETE_CONFIRMATION, deletionDetail, deletionErrorMessage, deletionSharedLogin, submitGuardianDeletion } from './account-deletion';
import type { DeletionTarget } from './account-deletion';

const AUTH_ERRORS = ['invalid-credential', 'wrong-password', 'user-not-found', 'too-many-requests', 'network-request-failed', 'user-mismatch', 'requires-recent-login'];

/** One delete page: the typed confirmation the deletion callable requires, behind a fresh sign-in. */
export default function GuardianDeletion({ target }: { target: DeletionTarget }) {
  const ids = { password: useId(), typed: useId() };
  const [actorUid] = useState(() => auth.currentUser?.uid || '');
  const user = auth.currentUser;
  const needsPassword = Boolean(user?.providerData?.some(provider => provider?.providerId === 'password'));
  const [password, setPassword] = useState(''), [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [refused, setRefused] = useState(false);
  const [accepted, setAccepted] = useState<{ receiptToken: string; deletingCaller: boolean } | null>(null);
  async function submit() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      setAccepted(await submitGuardianDeletion({ actorUid, target, typed, password, needsPassword }, {
        currentUser: () => {
          const current = auth.currentUser;
          return current && { uid: current.uid, email: current.email, reauthenticate: async (email: string, secret: string) => {
            await current.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(email, secret));
            await current.getIdToken(true);
          } };
        },
        call: (name, data) => cloud.httpsCallable(name)(data),
      }));
    } catch (failure: any) {
      const message = AUTH_ERRORS.includes(authErrorCode(failure)) ? accountError(failure)
        : deletionErrorMessage(failure, failure?.message || 'Deletion could not be requested. Please try again.');
      setError(message);
      // A shared sign-in is a definitive refusal: the request is not offered again from here.
      if (message === deletionSharedLogin) setRefused(true);
    } finally {
      setBusy(false); setPassword('');
    }
  }
  if (accepted) return <div className="account-form" role="status">
    <p>Deletion requested. It can take up to 30 days.</p>
    <p>Receipt: <code>{accepted.receiptToken}</code></p>
    {target.kind === 'self' && <button type="button" onClick={() => { void auth.signOut(); }}>Sign out</button>}
  </div>;
  return <form className="account-form" data-clarity-mask="true" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <p>{deletionDetail(target)}</p>
    {needsPassword && <label htmlFor={ids.password}>Your password<input id={ids.password} type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>}
    <label htmlFor={ids.typed}>Type {DELETE_CONFIRMATION} to confirm<input id={ids.typed} autoComplete="off" autoCapitalize="characters" spellCheck={false} required value={typed} onChange={event => setTyped(event.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" className="account-delete-submit" disabled={busy || refused || typed.trim() !== DELETE_CONFIRMATION || (needsPassword && !password)}>{busy ? 'Requesting…' : 'Delete'}</button>
  </form>;
}
