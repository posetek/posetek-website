import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { findGuardian } from "../../lib/identity";
import { playerStatsRoute } from "../landing/landing-helpers";
import AddPlayer from "./AddPlayer";
import { loadFamilyChildren } from "./family";
import type { FamilyChild } from "./family";
import "../../styles/pose-portal.css";
import "../organization/organization.scss";
import "./family.scss";

/** The parent home: the linked children, each opening that child's own player view, and Add player. */
export default function FamilyPage() {
  const navigate = useNavigate();
  const [children, setChildren] = useState<FamilyChild[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const generation = useRef(0);
  const show = useCallback(async (uid: string, playerIds?: string[]) => {
    const current = ++generation.current;
    const isCurrent = () => current === generation.current && auth.currentUser?.uid === uid;
    try {
      const ids = playerIds ?? (await findGuardian(db, uid))?.playerIds;
      if (!isCurrent()) return;
      // Not a parent: the sign-in page sends every other account to its own home.
      if (!ids) { navigate("/signin", { replace: true }); return; }
      const rows = await loadFamilyChildren(db, ids);
      if (isCurrent()) { setChildren(rows); setError(""); }
    } catch {
      if (isCurrent()) setError("Your players could not be loaded. Refresh to try again.");
    }
  }, [navigate]);
  useEffect(() => {
    document.title = "Players | PoseTek";
    const requests = generation;
    const stop = auth.onAuthStateChanged(user => {
      ++requests.current;
      setChildren(null); setError(""); setAdding(false);
      if (!user) { navigate(`/signin?returnTo=${encodeURIComponent("/family")}`, { replace: true }); return; }
      void show(user.uid);
    });
    return () => { ++requests.current; stop(); };
  }, [navigate, show]);
  const uid = auth.currentUser?.uid;
  return <div className="pt-pose portal-body pt-club family-page">
    <header className="portal-header family-header">
      <span className="portal-brand portal-wordmark"><span>POSETEK</span></span>
      <button type="button" className="quiet-button" onClick={() => { void auth.signOut().then(() => navigate("/signin")).catch(() => setError("Sign out failed. Try again.")); }}>Sign out</button>
    </header>
    <main className="club-shell">
      <section className="club-card">
        <div className="club-section-title"><h1>Players</h1>{children && !adding && <button type="button" className="quiet-button" onClick={() => setAdding(true)}>Add player</button>}</div>
        {error && <p className="club-message error" role="alert">{error}</p>}
        {!children && !error && <p role="status">Loading…</p>}
        {children && (children.length ? <nav className="club-player-list" aria-label="Players">{children.map(child => <FamilyRow key={child.id} child={child} />)}</nav>
          : <p>No players yet.</p>)}
        {children && adding && uid && <AddPlayer onAdded={playerIds => { setAdding(false); void show(uid, playerIds); }} />}
      </section>
    </main>
  </div>;
}

export function FamilyRow({ child }: { child: FamilyChild }) {
  const name = child.name || "Player";
  return <Link className="family-row" to={playerStatsRoute(child.id)}>
    <span className="family-row-text">
      <strong>{name}</strong>
      {/* W4 renders the child's time on platform here (`child.platformTime`). */}
      {child.platformTime ? <span className="family-time" data-slot="platform-time" /> : null}
    </span>
    <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
  </Link>;
}
