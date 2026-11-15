import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { getPlayerGuardians } from "../../lib/guardians";
import { findGuardian } from "../../lib/identity";
import { loadPlatformTime, platformTimeText } from "../../lib/platform-time";
import { refreshAdminIdentity } from "../admin/lib/identity";
import AddPlayer from "./AddPlayer";
import { familyChildPath, familyPreviewRequest, loadFamilyChildren, previewParent } from "./family";
import type { FamilyChild } from "./family";
import "../../styles/pose-portal.css";
import "../organization/organization.scss";
import "./family.scss";

type Preview = { email: string | null } | null;

/**
 * The parent home: the linked children, each opening that child's own player view, and Add player.
 * For a PoseTek admin, `?previewParent=&fromPlayer=` shows that parent's list read-only instead.
 */
export default function FamilyPage() {
  const navigate = useNavigate();
  const [children, setChildren] = useState<FamilyChild[] | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const generation = useRef(0);
  const show = useCallback(async (uid: string, playerIds?: string[]) => {
    const current = ++generation.current;
    const isCurrent = () => current === generation.current && auth.currentUser?.uid === uid;
    try {
      let ids = playerIds;
      let previewing: Preview = null;
      if (!ids) {
        const search = window.location.search;
        const admin = new URLSearchParams(search).has("previewParent") ? (await refreshAdminIdentity(auth.currentUser)).isAdmin : false;
        if (!isCurrent()) return;
        const request = familyPreviewRequest(search, admin);
        if (request) {
          const parent = previewParent(await getPlayerGuardians(request.playerId), request.parentUid);
          if (!isCurrent()) return;
          if (!parent) { setChildren(null); setError("This parent is no longer linked to this player."); return; }
          ids = parent.playerIds; previewing = { email: parent.email };
        } else {
          ids = (await findGuardian(db, uid))?.playerIds;
          if (!isCurrent()) return;
          // Not a parent: the sign-in page sends every other account to its own home.
          if (!ids) { navigate("/signin", { replace: true }); return; }
        }
      }
      const rows = await loadFamilyChildren(db, ids);
      if (!isCurrent()) return;
      setChildren(rows); setPreview(previewing); setError("");
      // Time on platform fills in after the list; a failure only leaves its row without it.
      for (const row of rows) void loadPlatformTime(uid, row.id).then(platformTime => {
        if (isCurrent() && platformTime) setChildren(old => old?.map(child => child.id === row.id ? { ...child, platformTime } : child) || old);
      });
    } catch {
      if (isCurrent()) setError("Your players could not be loaded. Refresh to try again.");
    }
  }, [navigate]);
  useEffect(() => {
    document.title = "Players | PoseTek";
    const requests = generation;
    const stop = auth.onAuthStateChanged(user => {
      ++requests.current;
      setChildren(null); setPreview(null); setError(""); setAdding(false);
      if (!user) { navigate(`/signin?returnTo=${encodeURIComponent("/family")}`, { replace: true }); return; }
      void show(user.uid);
    });
    return () => { ++requests.current; stop(); };
  }, [navigate, show]);
  const uid = auth.currentUser?.uid;
  const previewing = preview !== null;
  return <div className="pt-pose portal-body pt-club family-page">
    <header className="portal-header family-header">
      <span className="portal-brand portal-wordmark"><span>POSETEK</span></span>
      {!previewing && <button type="button" className="quiet-button" onClick={() => { void auth.signOut().then(() => navigate("/signin")).catch(() => setError("Sign out failed. Try again.")); }}>Sign out</button>}
    </header>
    <main className="club-shell">
      <section className="club-card">
        {preview && <p className="eyebrow" data-clarity-mask="true">Parent view{preview.email ? ` · ${preview.email}` : ""}</p>}
        <div className="club-section-title"><h1>Players</h1>{children && !adding && !previewing && <button type="button" className="quiet-button" onClick={() => setAdding(true)}>Add player</button>}</div>
        {error && <p className="club-message error" role="alert">{error}</p>}
        {!children && !error && <p role="status">Loading…</p>}
        {children && (children.length ? <nav className="club-player-list" aria-label="Players">{children.map(child => <FamilyRow key={child.id} child={child} preview={previewing} />)}</nav>
          : <p>No players yet.</p>)}
        {children && adding && !previewing && uid && <AddPlayer onAdded={playerIds => { setAdding(false); void show(uid, playerIds); }} />}
      </section>
    </main>
  </div>;
}

export function FamilyRow({ child, preview = false }: { child: FamilyChild; preview?: boolean }) {
  const name = child.name || "Player";
  const time = platformTimeText(child.platformTime);
  return <Link className="family-row" to={familyChildPath(child.id, preview)}>
    <span className="family-row-text">
      <strong>{name}</strong>
      {time && <span className="family-time" data-slot="platform-time">Time on PoseTek · {time}</span>}
    </span>
    <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
  </Link>;
}
