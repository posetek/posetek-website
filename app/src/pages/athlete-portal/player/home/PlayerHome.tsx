import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { auth } from '../../../../lib/firebase';
import { PlayerHeader } from '../PlayerShell';
import { useCoachConfig } from '../gateway';
import type { PlayerTabProps } from '../workspace';
import { feedUnavailable, remoteFeedEnabled, useHomeFeed } from './home-feed';
import { FeedList, LoadingRow, LoadingState, StateCard } from './HomeFeed';
import { PREVIEW_CONTEXT, previewActivities, previewFeedPhase } from './preview-feed';
import WeekRecap from './WeekRecap';
import type { RecapPreview } from './WeekRecap';
import './home.css';

type Config = Record<string, unknown> | null;

/** Reads `config/llm` through the workspace's existing listener; remounted (by key) to retry after a failure. */
function ConfigProbe({ preview, onConfig }: { preview: boolean; onConfig: (config: Config) => void }) {
  const config = useCoachConfig(preview);
  useEffect(() => { onConfig(config); }, [config, onConfig]);
  return null;
}

/**
 * Home: the app's `AthleteWorkspaceHome`, which is the community feed in workspace mode
 * (`CommunityFeedView` with `workspacePlayerName`): the week recap first, then "Organization
 * activity" in the organization scope with no scope menu, behind `config/llm.communityFeedEnabled`.
 */
export default function PlayerHome({ ctx, preview, active, athlete, report, personal }: PlayerTabProps) {
  const location = useLocation();
  const mode = preview ? new URLSearchParams(location.search).get('homePreview') : null;
  const [configAttempt, setConfigAttempt] = useState(0);
  const [config, setConfig] = useState<Config>(null);
  const settingsFailed = preview ? mode === 'feed-settings-error' : !!config?.unavailable;
  const settingsLoaded = preview ? mode !== 'feed-settings-loading' : config !== null && !config.unavailable;
  const enabled = preview ? !['feed-off', 'feed-settings-error', 'feed-settings-loading'].includes(mode || '') : settingsLoaded && remoteFeedEnabled(config);
  const samplePhase = previewFeedPhase(mode);
  const sample = preview ? {
    phase: samplePhase, context: enabled && samplePhase.kind === 'ready' ? PREVIEW_CONTEXT : null,
    activities: mode === 'feed-empty' ? [] : previewActivities(),
  } : undefined;
  const feed = useHomeFeed({ enabled, active, identity: `${auth.currentUser?.uid ?? ''}:${ctx.playerId ?? ''}`, sample });
  const playerName = typeof athlete?.name === 'string' ? athlete.name : '';
  const organizationName = feed.context?.organizationName;
  const recapPreview = (mode?.startsWith('week-') ? mode.slice(5) : undefined) as RecapPreview;
  const phase = feed.phase;

  return <>
    <PlayerHeader title="Home" />
    {!preview && <ConfigProbe key={configAttempt} preview={false} onConfig={setConfig} />}
    <div className="home-stack">
      <WeekRecap key={`${ctx.playerId}:${auth.currentUser?.uid ?? ''}`} access={ctx.access} playerName={playerName} playerId={ctx.playerId} active={active}
        preview={preview} previewState={recapPreview} feedUnavailable={feedUnavailable(enabled, phase)} report={report} includePersonal={personal?.enabled === true} />
      <div className="home-section-heading">
        <h2>Organization activity</h2>
        {organizationName && <p>{organizationName}</p>}
      </div>
      {enabled ? phase.kind === 'idle' || phase.kind === 'loading' ? <LoadingState />
        : phase.kind === 'gated' ? <StateCard kind="gated" message={phase.message} onRetry={feed.reload} />
        : phase.kind === 'refused' ? <StateCard kind="refused" message={phase.message} onRetry={feed.reload} />
        : phase.kind === 'failed' ? <StateCard kind="error" message={phase.message} onRetry={feed.reload} />
        : <FeedList feed={feed} active={active} sample={preview} />
        : settingsFailed ? <StateCard kind="error" message="Organization activity settings could not be loaded." onRetry={() => { setConfig(null); setConfigAttempt(value => value + 1); }} />
        : settingsLoaded ? <p className="home-secondary">Organization activity is turned off.</p>
        : <LoadingRow text="Loading organization settings" />}
    </div>
  </>;
}
