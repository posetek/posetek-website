import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './player.css';

/** The athlete workspace's four destinations, in the mobile dock's order (`WorkspaceTab`). */
export const PLAYER_TABS = [
  { view: 'home', label: 'Home', icon: 'home' },
  { view: 'coach', label: 'Coach', icon: 'forum' },
  { view: 'workouts', label: 'Workouts', icon: 'directions_run' },
  { view: 'stats', label: 'Stats', icon: 'bar_chart' },
] as const;
export type PlayerView = typeof PLAYER_TABS[number]['view'];

/** Links saved before the four-tab workspace keep opening the destination that replaced them. */
const LEGACY_VIEWS: Record<string, PlayerView> = {
  profile: 'stats', aiCoach: 'coach', training: 'workouts', drills: 'workouts', leaderboards: 'home', feed: 'home',
};
export function canonicalPlayerView(raw: string | null | undefined): PlayerView {
  const tab = PLAYER_TABS.find(item => item.view === raw);
  return tab ? tab.view : LEGACY_VIEWS[raw || ''] || 'home';
}

/** Parameters that select a page inside one tab. A dock tap always opens that tab's root. */
export const PLAYER_SUBROUTE_KEYS = ['drill', 'session', 'rep', 'screen', 'page'] as const;

/** Only social route context crosses from the player portal into Community. */
export function communityPath(search = '', pathname = '/feed') {
  const source = new URLSearchParams(search), next = new URLSearchParams();
  for (const key of ['preview', 'organizationId', 'viewAsPlayerId', 'activity', 'connect', 'panel']) {
    const value = source.get(key);
    if (value) next.set(key, value);
  }
  return `${pathname}${next.size ? `?${next}` : ''}`;
}

export function playerTabPath(view: string, search = '', pathname = '/athlete') {
  const fromCommunity = pathname === '/feed' || pathname === '/feed.html';
  if (view === 'feed') return communityPath(search, fromCommunity ? pathname : '/feed');
  // Admin athlete previews never become self-player navigation.
  if (fromCommunity && new URLSearchParams(search).has('viewAsPlayerId')) return communityPath(search, pathname);
  const params = fromCommunity ? new URLSearchParams() : new URLSearchParams(search);
  params.set('view', view);
  if (fromCommunity && new URLSearchParams(search).get('preview') === '1') params.set('preview', '1');
  for (const key of PLAYER_SUBROUTE_KEYS) params.delete(key);
  return `${fromCommunity ? '/athlete' : pathname}?${params}`;
}

type PlayerChrome = { initials?: string; onSignOut?: () => void; onAccountSettings?: () => void; onReturnHome?: () => void };
const PlayerChromeContext = createContext<PlayerChrome>({});

function AccountMenu() {
  const { initials, onSignOut, onAccountSettings, onReturnHome } = useContext(PlayerChromeContext);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  if (!onSignOut && !onAccountSettings && !onReturnHome) return null;
  const choose = (action: () => void) => () => { setOpen(false); action(); };
  return <div className="v4-account" ref={root}>
    <button type="button" className="v4-account-button" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {initials || <span className="material-symbols-outlined" aria-hidden="true">person</span>}
    </button>
    {open && <div className="v4-account-menu" role="menu">
      {onAccountSettings && <button type="button" role="menuitem" onClick={choose(onAccountSettings)}><span className="material-symbols-outlined" aria-hidden="true">account_circle</span>Account settings</button>}
      {onReturnHome && <button type="button" role="menuitem" onClick={choose(onReturnHome)}><span className="material-symbols-outlined" aria-hidden="true">home</span>Return to home</button>}
      {onSignOut && <button type="button" role="menuitem" onClick={choose(onSignOut)}><span className="material-symbols-outlined" aria-hidden="true">logout</span>Sign out</button>}
    </div>}
  </div>;
}

type PlayerHeaderProps = { title: string; onBack?: () => void; backLabel?: string; children?: ReactNode };

/**
 * The title and account control each destination renders at the top of its own content, as the
 * mobile `V4PlayerHeader` does. A tab root uses the large title; a page pushed inside a tab passes
 * `onBack` and gets the compact bar with a Back control.
 */
export function PlayerHeader({ title, onBack, backLabel = 'Back', children }: PlayerHeaderProps) {
  if (onBack) return <header className="v4-header v4-header-compact">
    <button type="button" className="v4-back" aria-label={backLabel} onClick={onBack}><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></button>
    <h1>{title}</h1>
    <div className="v4-header-actions">{children}</div>
  </header>;
  return <header className="v4-header">
    <h1>{title}</h1>
    <div className="v4-header-actions">{children}<AccountMenu /></div>
  </header>;
}

type PlayerShellProps = PlayerChrome & {
  activeView: string;
  children: ReactNode;
  /** Renders the large tab header above the content, for a page that does not render its own. */
  title?: string;
  search?: string;
  pathname?: string;
  onNavigate?: (view: string) => void;
  navigationDisabled?: boolean;
  /** A full-screen page inside a tab (a running workout) hides the dock, as the app does. */
  hideDock?: boolean;
  className?: string;
  mainClassName?: string;
};

/** The app's `LogoutConfirmationView`: signing out always asks first. */
function SignOutConfirmation({ onSignOut, onCancel }: { onSignOut: () => void; onCancel: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onCancel]);
  return <div className="v4-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="v4-confirm" role="alertdialog" aria-modal="true" aria-labelledby="v4-sign-out-title" aria-describedby="v4-sign-out-detail">
      <span className="material-symbols-outlined v4-confirm-icon" aria-hidden="true">logout</span>
      <h2 id="v4-sign-out-title">Sign out?</h2>
      <p id="v4-sign-out-detail">You'll need to sign back in to reach your roster.</p>
      <button type="button" className="v4-confirm-destructive" onClick={onSignOut}>Sign Out</button>
      <button type="button" ref={cancel} onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

export default function PlayerShell({ activeView, children, title, search = '', pathname = '/athlete', onNavigate, onSignOut, onAccountSettings, onReturnHome, initials, navigationDisabled = false, hideDock = false, className = '', mainClassName = '' }: PlayerShellProps) {
  const active = canonicalPlayerView(activeView);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const askToSignOut = onSignOut ? () => setConfirmingSignOut(true) : undefined;
  const navigate = (event: MouseEvent<HTMLAnchorElement>, view: string) => {
    if (navigationDisabled) { event.preventDefault(); return; }
    if (onNavigate && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); onNavigate(view);
    }
  };
  return <PlayerChromeContext.Provider value={{ initials, onSignOut: askToSignOut, onAccountSettings, onReturnHome }}>
    <div className={`pt-pose pt-player${className ? ` ${className}` : ''}`}>
      <main className={`player-main${mainClassName ? ` ${mainClassName}` : ''}`}>
        {title && <PlayerHeader title={title} />}
        {children}
      </main>
      {!hideDock && <nav className="player-bottom-nav" aria-label="Player tabs">
        {PLAYER_TABS.map(tab => <Link key={tab.view} to={playerTabPath(tab.view, search, pathname)} aria-current={active === tab.view ? 'page' : undefined} aria-disabled={navigationDisabled || undefined} onClick={event => navigate(event, tab.view)}>
          <span className="material-symbols-outlined" aria-hidden="true">{tab.icon}</span><span>{tab.label}</span>
        </Link>)}
      </nav>}
      {confirmingSignOut && onSignOut && <SignOutConfirmation onSignOut={() => { setConfirmingSignOut(false); onSignOut(); }} onCancel={() => setConfirmingSignOut(false)} />}
    </div>
  </PlayerChromeContext.Provider>;
}

/** Initials for the account control, matching the app's `SocialFormat.initials`. */
export function playerInitials(name: string | null | undefined) {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => [...word][0]).join('');
}
