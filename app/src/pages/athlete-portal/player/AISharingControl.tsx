import { useEffect, useRef, useState } from 'react';
import { auth } from '../../../lib/firebase';
import { setAISharing } from './ai-sharing';

export default function AISharingControl({ preview, onAllowed }: { preview: boolean; onAllowed?: () => void }) {
  const [open, setOpen] = useState(false), [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(''), [error, setError] = useState('');
  const operation = useRef(0), busy = useRef(false);
  useEffect(() => {
    const reset = () => { operation.current++; busy.current = false; setSaving(false); setNotice(''); setError(''); setOpen(false); };
    if (preview) return () => { operation.current++; };
    const stop = auth.onAuthStateChanged(reset);
    return () => { operation.current++; stop(); };
  }, [preview]);
  const choose = async (allowed: boolean) => {
    if (busy.current) return;
    const token = ++operation.current;
    busy.current = true; setSaving(true); setError(''); setNotice('');
    try {
      if (!preview) await setAISharing(allowed);
      if (token !== operation.current) return;
      setNotice(preview ? 'Preview only. No account preference was changed.' : allowed
        ? 'AI sharing allowed. You can send your request when you are ready.'
        : 'New AI requests are off on this browser. Your saved workouts and results remain available.');
      if (allowed) onAllowed?.();
    } catch (e) {
      if (token === operation.current) setError(e instanceof Error ? e.message : 'Permission could not be confirmed. Try again.');
    } finally {
      if (token === operation.current) { busy.current = false; setSaving(false); }
    }
  };
  return <section className="ai-sharing-control" aria-label="AI sharing">
    <button type="button" className="hub-secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>Review AI sharing</button>
    {open && <div className="portal-card">
      <h2>Your choice about AI sharing</h2>
      <p>AI coaching and workout creation can send your messages, relevant profile details, test results, training history and selected exercise information to Google Vertex AI or Anthropic to prepare a response.</p>
      <p>Allow sharing only for your own signed-in account. You can decline or turn it off here or from Profile at any time. Turning it off blocks new AI requests on this browser; requests already sent may finish. It does not delete previous conversations or saved workouts.</p>
      <p><a href="/privacy#ai-and-automated-processing" target="_blank" rel="noreferrer">Read the privacy policy</a></p>
      <div className="ai-sharing-actions">
        <button type="button" className="primary-cta" disabled={saving} onClick={() => void choose(true)}>Allow AI sharing</button>
        <button type="button" className="hub-secondary" disabled={saving} onClick={() => void choose(false)}>Keep AI sharing off</button>
      </div>
      {saving && <p role="status">Saving your choice…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p className="player-error" role="alert">{error}</p>}
    </div>}
  </section>;
}
