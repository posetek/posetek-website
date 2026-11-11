import { useEffect, useState } from 'react';
import { auth } from '../../../../lib/firebase';
import { reportFocus } from '../report';
import type { ReportState } from '../report';
import { loadRecentTraining, previewTraining, progression, recentWorkouts, sessionCountText, weekSummary, weekTitle } from './recent-training';
import type { OutdoorRun, RecentTraining } from './recent-training';

const shortDate = (date: Date | number) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
const dateTime = (date: Date) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);

/** The website has no source for the phone's GPS runs, rides and walks (see `OutdoorRun`). */
const NO_RUNS: OutdoorRun[] = [];

export type RecapPreview = 'loading' | 'failed' | 'empty' | undefined;

type Props = {
  access: string;
  playerName: string;
  playerId: string | null;
  active: boolean;
  preview: boolean;
  previewState?: RecapPreview;
  feedUnavailable: boolean;
  report: ReportState;
};

/** The app's `AthleteWeekRecap`: the first card on Home. */
export default function WeekRecap({ access, playerName, playerId, active, preview, previewState, feedUnavailable, report }: Props) {
  const [recent, setRecent] = useState<RecentTraining | null>(() => preview && !previewState ? previewTraining(new Date())
    : preview && previewState === 'empty' ? { logs: [], sessions: [], storedWorkoutTitles: {} } : null);
  const [failed, setFailed] = useState(preview && previewState === 'failed');
  const [attempt, setAttempt] = useState(0);
  const [foreground, setForeground] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');

  // The app reloads whenever Home becomes active again, including a return to the foreground.
  useEffect(() => {
    const changed = () => setForeground(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  useEffect(() => {
    if (preview || !active || !foreground || !playerId || playerId.includes('/')) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let current = true;
    loadRecentTraining(playerId, new Date()).then(training => {
      if (!current || auth.currentUser?.uid !== uid) return;
      setFailed(false); setRecent(training);
    }, () => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [preview, active, foreground, playerId, attempt]);

  const now = new Date();
  const summary = recent && playerId ? weekSummary(recent, NO_RUNS, now) : null;
  const shown = report.report;
  const focus = shown ? reportFocus(shown) : null;
  const progress = !focus && recent ? progression(recent, now) : null;
  const entries = feedUnavailable && recent && playerId ? recentWorkouts(recent, NO_RUNS, now) : [];

  return <div className="home-recap">
    <div className="home-recap-header">
      <p className="home-recap-title"><span className="material-symbols-outlined" aria-hidden="true">calendar_today</span>{weekTitle(access, playerName)}</p>
      <span className="home-caption">Last 7 days</span>
    </div>
    {summary ? <>
      <p className="home-recap-count">{sessionCountText(summary.current)}</p>
      {summary.previous > 0 ? <p className="home-secondary">Previous week: {summary.previous} recorded.</p>
        : summary.current === 0 ? <p className="home-secondary">Your next completed workout will appear here.</p> : null}
    </> : failed ? <button type="button" className="home-recap-reload" onClick={() => setAttempt(value => value + 1)}>Reload recent workouts</button>
      : <p className="home-progress" role="status"><span className="home-spinner" aria-hidden="true" />Loading recent workouts</p>}
    {shown && focus ? <>
      <p className="home-recap-focus">{focus}</p>
      <p className="home-caption">{shown.kind === 'event' ? 'Latest testing' : 'Latest measurement'} · {shortDate(shown.testDateMillis)}</p>
    </> : progress ? <>
      <p className="home-recap-focus">{progress.text}</p>
      <p className="home-caption">Workout · {shortDate(progress.date)}</p>
    </> : null}
    {entries.length > 0 && <>
      <hr className="home-divider" />
      <h3 className="home-recap-subtitle">Recent workouts</h3>
      {entries.map(entry => <div className="home-recent-row" key={entry.id}>
        <strong>{entry.title}</strong>
        <span className="home-caption">{dateTime(entry.completed)}</span>
      </div>)}
    </>}
  </div>;
}
