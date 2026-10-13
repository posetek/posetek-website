import { useEffect, useState } from "react";
import { accountError } from "../landing/account-entry";
import { COACH_CODE, coachEnrollmentDestination } from "./invitation";
import type { CoachInvitation } from "./invitation";
import "./coach-enrollment.css";

declare global { interface Window { __posetekCoachInvite?: string } }

export function CoachInvitationSummary({ invitation }: { invitation: CoachInvitation }) {
  return <section className="coach-invite-scope" aria-label="Your assigned teams">
    <p className="coach-invite-label">{invitation.label}</p>
    <h2>{invitation.organizationName}</h2>
    <ul>{invitation.teamNames?.map(name => <li key={name}>{name}</li>)}</ul>
    <p>Coach access to these teams only.</p>
  </section>;
}
export default function CoachEnrollmentPage() {
  const [code] = useState(() => window.__posetekCoachInvite || "");
  const [invitation, setInvitation] = useState<CoachInvitation | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [mode, setMode] = useState<"create" | "existing">("create"), [accountCreated, setAccountCreated] = useState(false);
  const [firstName, setFirstName] = useState(""), [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [destination, setDestination] = useState("");
  useEffect(() => {
    let cancelled = false;
    delete window.__posetekCoachInvite;
    if (!COACH_CODE.test(code)) { setError("Reopen the private link in your invitation message. If you don't have an invitation, contact PoseTek."); setLoading(false); return; }
    import("./auth").then(({ coachEnrollmentCall }) => coachEnrollmentCall<CoachInvitation>("inspectCoachEnrollmentLink", { code }))
      .then(value => { if (!cancelled) setInvitation(value); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "This invitation could not be checked. Try opening it again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [code]);
  async function activate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || invitation?.status !== "ready") return;
    setError(""); setBusy(true);
    try {
      const { authenticateCoach, coachEnrollmentCall } = await import("./auth");
      // Recheck expiry and current team/issuer scope before creating/signing in.
      const checked = await coachEnrollmentCall<CoachInvitation>("inspectCoachEnrollmentLink", { code });
      if (checked.status !== "ready") { setInvitation(checked); return; }
      const session = await authenticateCoach(mode, email, password);
      if (mode === "create") { setAccountCreated(true); setMode("existing"); }
      if (!session.isCurrent()) throw new Error("The signed-in account changed. Sign in again before activating.");
      const result = await coachEnrollmentCall<{ organizationId: string; teamIds: string[] }>("claimCoachEnrollmentLink", { code, firstName: firstName.trim(), lastName: lastName.trim() }, session.token);
      if (!session.isCurrent()) throw new Error("The signed-in account changed. Sign in normally to check your access.");
      setDestination(coachEnrollmentDestination(result)); setPassword("");
    } catch (e) {
      setError(e instanceof Error && !("code" in e) ? e.message : accountError(e));
    } finally { setBusy(false); }
  }
  return <main className="coach-join-page">
    <a className="coach-join-brand" href="/">PoseTek</a>
    <div className="coach-join-card">
      <h1>{destination ? "Your coach account is ready." : "Welcome, coach."}</h1>
      <p className="coach-join-intro">{destination ? "Your assigned teams, player progress and workout prescribing are together in Team Insights." : "Enter your own name and login details to join your assigned teams."}</p>
      {loading && <p role="status">Checking your invitation…</p>}
      {invitation?.status === "ready" && <CoachInvitationSummary invitation={invitation} />}
      {error && <p className="coach-join-error" role="alert">{error}</p>}
      {destination ? <a className="coach-join-primary" href={destination}>Open Team Insights <span aria-hidden="true">→</span></a>
        : invitation?.status === "claimed" ? <div><p>This invitation has already been used. Sign in with your coach account to open Team Insights.</p><a className="coach-join-primary" href="/signin">Sign in</a></div>
        : invitation?.status === "ready" && <>
          <fieldset className="coach-join-mode" disabled={busy}><legend>Your account</legend>
            <label><input type="radio" name="account-mode" checked={mode === "create"} onChange={() => setMode("create")} /> Create account</label>
            <label><input type="radio" name="account-mode" checked={mode === "existing"} onChange={() => setMode("existing")} /> Use existing account</label>
          </fieldset>
          <form onSubmit={event => { void activate(event); }}>
            <fieldset disabled={busy} className="coach-join-fields"><legend className="coach-join-visually-hidden">Your details</legend>
              <div className="coach-join-names"><label>First name<input name="given-name" autoComplete="given-name" required maxLength={100} value={firstName} onChange={e => setFirstName(e.target.value)} /></label>
                <label>Last name<input name="family-name" autoComplete="family-name" required maxLength={100} value={lastName} onChange={e => setLastName(e.target.value)} /></label></div>
              <label>Email<input name="email" type="email" autoComplete="email" inputMode="email" spellCheck={false} required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
              <label>{mode === "create" ? "Choose a password" : "Your password"}<input name="password" type="password" autoComplete={mode === "create" ? "new-password" : "current-password"} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /></label>
              <p className="coach-join-hint">{mode === "create" ? "Use at least 6 characters. You'll use this email and password whenever you sign in." : "Sign in again here to confirm which account receives coach access."}</p>
              {accountCreated && <p role="status">Your login was created. If activation was interrupted, use the same email and password to retry.</p>}
              <button type="submit" className="coach-join-primary" disabled={busy}>{busy ? "Activating your access…" : "Activate coach access"}</button>
            </fieldset>
          </form>
          <p className="coach-join-note">This private invitation works once and expires after seven days. No verification email is needed. Keep it for your own account.</p>
        </>}
      <a className="coach-join-help" href="/support">Need help? Contact PoseTek</a>
    </div>
  </main>;
}
