import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PlayerRow } from "../lib/accounts";
import { normalizedPlayerPhone, saveClassifiedPhone, type ContactType } from "../lib/playerPhone";

const text = (value: unknown): string | null => typeof value === "string" ? value : null;

function PhoneEditor({ playerId, contactType, recorded, onSaved }: {
  playerId: string; contactType: ContactType; recorded: string | null; onSaved: () => Promise<void>;
}) {
  const label = contactType === "player" ? "Player phone" : "Parent/guardian phone";
  const [phone, setPhone] = useState(recorded || "");
  const [savedPhone, setSavedPhone] = useState(recorded);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const mounted = useRef(true);
  const saving = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const normalized = phone.trim() ? normalizedPlayerPhone(phone) : null;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current || conflict) return;
    if (phone.trim() && !normalized) { setFailed(true); setMessage("Enter a complete 10-digit US phone number."); return; }
    saving.current = true; setBusy(true); setMessage(""); setFailed(false);
    try {
      const value = await saveClassifiedPhone(playerId, contactType, phone, savedPhone);
      if (!mounted.current) return;
      setPhone(value || ""); setSavedPhone(value); setMessage(label + " saved.");
      await onSaved();
    } catch (error) {
      if (!mounted.current) return;
      const code = (error as { code?: string }).code || "";
      setConflict(true); setFailed(true);
      setMessage(code === "functions/aborted" ? "This number changed while you were editing. Refresh before saving."
        : code === "functions/permission-denied" ? "Your account cannot edit this phone number."
        : "The save could not be verified. Refresh the profile before trying again.");
    } finally { saving.current = false; if (mounted.current) setBusy(false); }
  };
  return <form className="admin-phone-form" onSubmit={save}>
    <label className="admin-field">{label}<input type="tel" inputMode="tel" autoComplete="off" maxLength={32}
      value={phone} disabled={busy || conflict} onChange={event => { setPhone(event.target.value); setMessage(""); }}
      aria-describedby={"admin-" + contactType + "-phone-help"} /></label>
    <p className="admin-note" id={"admin-" + contactType + "-phone-help"}>10-digit US number; +1 is also accepted. Leave blank if unknown.</p>
    <div className="admin-phone-actions"><button type="submit" className="primary-cta"
      disabled={busy || conflict || ((!phone.trim() || normalized !== null) && normalized === savedPhone)}>{busy ? "Saving…" : "Save " + label.toLowerCase()}</button>
      {failed && <button type="button" className="quiet-button" disabled={busy} onClick={() => void onSaved()}>Refresh profile</button>}
    </div>
    {message && <p className="form-message" role={failed ? "alert" : "status"}>{message}</p>}
  </form>;
}

export default function PlayerContactCard({ player, onSaved, readOnly = false }: {
  player: PlayerRow; onSaved: () => Promise<void>; readOnly?: boolean;
}) {
  const raw = player.raw || {};
  const legacy = text(raw.phone_number);
  const additionalParents = Array.isArray(raw.additional_parent_contacts) ? raw.additional_parent_contacts.filter(
    (value): value is { name?: string; phone: string } => value !== null && typeof value === "object" && typeof value.phone === "string"
  ) : [];
  return <section className="admin-card admin-contact-details" aria-label="Player contact details">
    <h3>Contact details</h3>
    <p className="admin-note">Keep the player’s phone separate from their parent or guardian’s phone. Only record a number under its known owner.</p>
    <dl><div><dt>Email</dt><dd>{player.email.trim() || "Not recorded"}</dd></div>
      {text(raw.parent_guardian_name) && <div><dt>Parent/guardian</dt><dd>{text(raw.parent_guardian_name)}</dd></div>}
    </dl>
    {(["player", "parent"] as const).map(type => {
      const recorded = text(raw[type + "_phone_number"]);
      const basis = text(raw[type + "_phone_basis"]);
      return <div key={type}>
        {readOnly ? <dl><div><dt>{type === "player" ? "Player phone" : "Parent/guardian phone"}</dt><dd>{recorded?.trim() || "Not recorded"}</dd></div></dl>
          : <PhoneEditor key={player.id + "/" + type + "/" + (recorded ?? "")} playerId={player.id} contactType={type} recorded={recorded} onSaved={onSaved} />}
        {basis && <p className="admin-note">{basis}</p>}
      </div>;
    })}
    {additionalParents.map((contact, index) => <dl key={index}><div><dt>Additional parent/guardian{text(contact.name) ? ": " + contact.name : ""}</dt><dd>{contact.phone}</dd></div></dl>)}
    {legacy && <details><summary>Previous contact number</summary><p>{legacy}</p><p className="admin-note">Retained from the original profile. Its owner is not inferred here.</p></details>}
  </section>;
}
