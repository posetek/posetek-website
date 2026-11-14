import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { PlayerRow } from "../lib/accounts";
import { normalizedPlayerPhone, savePlayerPhones, type PhoneEdit, type PhoneField } from "../lib/playerPhone";

const phoneFields = [
  { field: "player", label: "Player’s own phone", numberKey: "player_phone_number", basisKey: "player_phone_basis" },
  { field: "parent", label: "Parent or guardian phone", numberKey: "parent_phone_number", basisKey: "parent_phone_basis" },
  { field: "primary", label: "Primary contact phone (legacy)", numberKey: "phone_number", basisKey: null },
] as const;
type RecordedPhones = Record<PhoneField, { phone: string | null; basis: string | null }>;
export type PhoneChanges = Partial<RecordedPhones>;

const text = (value: unknown): string | null => typeof value === "string" ? value : null;

export default function PlayerContactCard({ player, onSaved, savedPhones, onPhonesSaved, readOnly = false }: {
  player: PlayerRow; onSaved: () => Promise<void>; savedPhones?: PhoneChanges;
  onPhonesSaved?: (changes: PhoneChanges) => void; readOnly?: boolean;
}) {
  const [localChanges, setLocalChanges] = useState<PhoneChanges>({});
  const confirm = onPhonesSaved ?? ((changes: PhoneChanges) => setLocalChanges(previous => ({ ...previous, ...changes })));
  const raw = player.raw || {};
  const recorded = Object.fromEntries(phoneFields.map(({ field, numberKey, basisKey }) => [
    field, (savedPhones ?? localChanges)[field] ?? { phone: text(raw[numberKey]), basis: basisKey ? text(raw[basisKey]) : null },
  ])) as RecordedPhones;
  const guardianName = text(raw.parent_guardian_name);
  const additionalParents: { name?: string; phone: string }[] = Array.isArray(raw.additional_parent_contacts) ? raw.additional_parent_contacts.filter(
    (value: unknown): value is { name?: string; phone: string } => value !== null && typeof value === "object" && "phone" in value && typeof value.phone === "string"
  ) : [];
  return <section className="admin-card admin-contact-details" aria-label="Player contact details">
    <h3>Contact details</h3>
    <dl>
      <div><dt>Email</dt><dd>{player.email.trim() || "Not recorded"}</dd></div>
      {guardianName && <div><dt>Parent or guardian</dt><dd>{guardianName}</dd></div>}
      {readOnly && phoneFields.map(({ field, label }) => <div key={field}>
        <dt>{label}</dt>
        <dd>{recorded[field].phone?.trim() || "Not recorded"}
          {recorded[field].phone?.trim() && recorded[field].basis && <p className="admin-note">{recorded[field].basis}</p>}
        </dd>
      </div>)}
    </dl>
    {!readOnly && <PhoneEditor key={player.id}
      playerId={player.id} saved={recorded} onRefresh={onSaved} onPhonesSaved={confirm} />}
    {additionalParents.map((contact, index) => <dl key={index}><div>
      <dt>Additional parent or guardian{text(contact.name) ? ": " + contact.name : ""}</dt><dd>{contact.phone}</dd>
    </div></dl>)}
  </section>;
}

function PhoneEditor({ playerId, saved, onRefresh, onPhonesSaved }: {
  playerId: string; saved: RecordedPhones; onRefresh: () => Promise<void>;
  onPhonesSaved: (changes: PhoneChanges) => void;
}) {
  const [drafts, setDrafts] = useState<Partial<Record<PhoneField, { input: string; expectedPhone: string | null }>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const helpId = useId();
  const mounted = useRef(true);
  const saving = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current || needsRefresh) return;

    const updates: PhoneEdit[] = [];
    for (const { field, label } of phoneFields) {
      const draft = drafts[field];
      if (!draft) continue;
      const input = draft.input.trim();
      const phone = input ? normalizedPlayerPhone(input) : null;
      if (!phone && (input || field === "primary")) {
        setMessage({ kind: "alert", text: label + " needs a complete 10-digit US number." });
        return;
      }
      if (phone !== draft.expectedPhone) updates.push({ field, phone, expectedPhone: draft.expectedPhone });
    }
    if (!updates.length) {
      setDrafts({});
      setMessage(null);
      return;
    }

    saving.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const bases = await savePlayerPhones(playerId, updates);
      const confirmed: PhoneChanges = {};
      for (const { field, phone } of updates) {
        const basis = bases[field];
        confirmed[field] = { phone, basis: typeof basis === "string" ? basis : null };
      }
      onPhonesSaved(confirmed);
      if (!mounted.current) return;
      setDrafts({});
      setMessage({ kind: "status", text: updates.length === 1 ? "Phone number saved." : "Phone numbers saved." });
    } catch (error) {
      if (!mounted.current) return;
      const code = (error as { code?: string } | null)?.code;
      setNeedsRefresh(true);
      setMessage({ kind: "alert", text: code === "functions/aborted"
        ? "A phone number changed while you were editing. Refresh the profile before saving."
        : code === "functions/permission-denied" ? "Your account cannot edit these phone numbers."
          : "The save could not be verified. Refresh the profile before trying again." });
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return <form className="admin-phone-form" onSubmit={save}>
    {phoneFields.map(({ field, label }) => <div key={field}>
      <label className="admin-field">{label}
        <input type="tel" inputMode="tel" autoComplete="off" maxLength={32}
          placeholder="Not recorded" value={drafts[field]?.input ?? saved[field].phone ?? ""} disabled={busy || needsRefresh}
          aria-describedby={helpId} onChange={event => {
            const input = event.target.value;
            setDrafts(previous => {
              const expectedPhone = previous[field] ? previous[field].expectedPhone : saved[field].phone;
              return { ...previous, [field]: input === (expectedPhone ?? "") ? undefined : { input, expectedPhone } };
            });
            setMessage(null);
          }} />
      </label>
      {saved[field].phone?.trim() && saved[field].basis && <p className="admin-note">{saved[field].basis}</p>}
    </div>)}
    <p className="admin-note" id={helpId}>Enter 10-digit US numbers. +1 is accepted. Leave the player or guardian field blank to clear it.</p>
    <div className="admin-phone-actions">
      <button type="submit" className="primary-cta" disabled={busy || needsRefresh || !Object.values(drafts).some(Boolean)}>
        {busy ? "Saving…" : "Save phone numbers"}
      </button>
      {needsRefresh && <button type="button" className="quiet-button" onClick={() => void onRefresh()}>Refresh profile</button>}
    </div>
    {message && <p className="form-message" role={message.kind}>{message.text}</p>}
  </form>;
}
