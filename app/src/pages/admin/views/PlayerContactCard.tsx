import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PlayerRow } from "../lib/accounts";
import { normalizedPlayerPhone, savePlayerPhone } from "../lib/playerPhone";

export default function PlayerContactCard({ player, onSaved, readOnly = false }: {
  player: PlayerRow; onSaved: () => Promise<void>; readOnly?: boolean;
}) {
  const recorded = typeof player.raw?.phone_number === "string" ? player.raw.phone_number : null;
  const [phone, setPhone] = useState(recorded || "");
  const [savedPhone, setSavedPhone] = useState(recorded);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const mounted = useRef(true);
  const saving = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const normalized = normalizedPlayerPhone(phone);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly || saving.current || conflict) return;
    if (!normalized) { setFailed(true); setMessage("Enter a complete 10-digit US phone number."); return; }
    saving.current = true; setBusy(true); setMessage(""); setFailed(false);
    try {
      const value = await savePlayerPhone(player.id, phone, savedPhone);
      if (!mounted.current) return;
      setPhone(value); setSavedPhone(value); setMessage("Phone number saved.");
      await onSaved();
    } catch (error) {
      if (!mounted.current) return;
      const code = (error as { code?: string }).code || "";
      setConflict(code === "functions/aborted"); setFailed(true);
      setMessage(code === "functions/aborted" ? "This number changed while you were editing. Refresh before saving."
        : code === "functions/permission-denied" ? "Your account cannot edit this phone number."
        : "The save could not be verified. Refresh the profile before trying again.");
    } finally { saving.current = false; if (mounted.current) setBusy(false); }
  };
  return <section className="admin-card admin-contact-details" aria-label="Player contact details">
    <h3>Contact details</h3>
    <p className="admin-note">For a child, use their parent or guardian’s phone number.</p>
    <dl><div><dt>Email</dt><dd>{player.email.trim() || "Not recorded"}</dd></div>
      {readOnly && <div><dt>Phone number</dt><dd>{recorded?.trim() || "Not recorded"}</dd></div>}
    </dl>
    {!readOnly && <form className="admin-phone-form" onSubmit={save}>
      <label className="admin-field">Phone number<input type="tel" inputMode="tel" autoComplete="tel" maxLength={32} required
        value={phone} disabled={busy || conflict} onChange={event => { setPhone(event.target.value); setMessage(""); }}
        aria-describedby="admin-phone-help" /></label>
      <p className="admin-note" id="admin-phone-help">10-digit US number; +1 is also accepted.</p>
      <div className="admin-phone-actions"><button type="submit" className="primary-cta"
        disabled={busy || conflict || (normalized !== null && normalized === savedPhone)}>{busy ? "Saving…" : "Save phone"}</button>
        {failed && <button type="button" className="quiet-button" disabled={busy} onClick={() => void onSaved()}>Refresh profile</button>}
      </div>
      {message && <p className="form-message" role={failed ? "alert" : "status"}>{message}</p>}
    </form>}
  </section>;
}
