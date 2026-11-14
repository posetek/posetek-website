import { useId, useState } from "react";
import { auth } from "../../lib/firebase";
import { accountError } from "../landing/account-entry";
import { addParentInvitation, guardianRedeemMessage, parentCodeFromInput, unavailableParentInvitation } from "../landing/parent-invitation-link";
import { redeemGuardianInvitation } from "../landing/signup-data";
import { forgetParentSession } from "../../lib/parent-session";

type Props = {
  /** Every child now linked to the login, from the redeem response. */
  onAdded: (playerIds: string[]) => void;
  /** "club" on the picker (the club player list's form); "sheet" inside the player view's account sheet. */
  variant?: "club" | "sheet";
  redeem?: (code: string) => Promise<unknown>;
  currentUid?: () => string | null;
};

/** "Add player": one field that takes a pasted parent code or link, and one button (plan §4.5). */
export default function AddPlayer({ onAdded, variant = "club", redeem = redeemGuardianInvitation, currentUid = () => auth.currentUser?.uid || null }: Props) {
  const id = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (busy) return;
    const code = parentCodeFromInput(value);
    if (!code) { setError(unavailableParentInvitation); return; }
    setBusy(true); setError("");
    try {
      const playerIds = await addParentInvitation(code, { currentUid, redeem });
      // The login's guardians record changed: the next "is this a parent" check reads it again.
      forgetParentSession(currentUid());
      setValue("");
      onAdded(playerIds);
    } catch (failure: any) {
      setError(guardianRedeemMessage(failure) || accountError(failure, failure?.message || "This player could not be added. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  const club = variant === "club";
  return <form className={club ? "club-inline family-add" : "account-form"} data-clarity-mask="true" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <label htmlFor={id}>Code or link<input id={id} name="parent-code" autoComplete="off" spellCheck={false} required value={value} onChange={event => { setValue(event.target.value); setError(""); }} /></label>
    <button className={club ? "primary-cta" : undefined} disabled={busy || !value.trim()}>Add player</button>
    {error && <p className={club ? "club-message error" : undefined} role="alert">{error}</p>}
  </form>;
}
