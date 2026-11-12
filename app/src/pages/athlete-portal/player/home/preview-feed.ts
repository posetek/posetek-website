import type { SocialContext } from '../../../feed/contracts';
import type { FeedPhase, HomeActivity } from './home-feed';

/**
 * Local preview only (`/athlete?preview=1&view=home`): sample organization activity, clearly not
 * a real account's. `homePreview=` shows one state: feed-off, feed-settings-error,
 * feed-settings-loading, feed-loading, feed-empty, feed-gated, feed-refused, feed-error,
 * week-loading, week-failed, week-empty.
 */
export const PREVIEW_CONTEXT: SocialContext = {
  uid: 'sample', playerId: 'preview-player', name: 'Avery Demo', organizationId: 'sample', organizationName: 'Summit Demo FC',
  teamId: 'sample-team', teamName: 'U17 Boys', staff: false, admin: false, enabled: true,
  preferences: { audience: 'organization', automatic: true, videos: true },
};

const base = {
  playerId: 'example', authorUid: null, mine: false, audience: 'organization' as const, hidden: false, liked: false,
  comments: 0, partial: false, canViewVideo: false, score: null, drill: null, repCount: 0,
};

export function previewActivities(now = Date.now()): HomeActivity[] {
  return [
    { ...base, id: 'sample-1', authorName: 'Jamie Rivera', teamName: 'U17 Boys', title: 'Shooting session', subtitle: '12 measured reps',
      kind: 'session', occurredAt: now - 3_600_000, drill: 'shooting', repCount: 12, kudos: 8, comments: 2, score: 104,
      metrics: [{ label: 'Reps', value: 12, unit: '' }, { label: 'Best', value: 58.4, unit: 'mph' }, { label: 'Average', value: 53.2, unit: 'mph' }],
      chart: [43, 48, 46, 51, 50, 55, 53, 51, 56, 54, 58.4, 57] },
    { ...base, id: 'sample-2', authorName: 'Sam Chen', teamName: 'U17 Boys', title: 'Build strength. Move faster.',
      subtitle: 'Split squat · Calf raises · Lateral bounds', kind: 'workout', occurredAt: now - 7_200_000, kudos: 5, liked: true, partial: true,
      metrics: [{ label: 'Drills', value: 3, unit: '' }, { label: 'Sets', value: 9, unit: '' }, { label: 'Active time', value: 24, unit: 'min' }], chart: [] },
    { ...base, id: 'sample-3', authorName: 'Taylor Brooks', teamName: 'U17 Girls', title: 'Morning run', subtitle: 'Run', kind: 'workout',
      outdoorActivity: 'run', outdoorGraphic: [[[2, 20], [5, 16], [9, 14], [13, 9], [18, 8], [23, 11], [27, 15], [29, 21], [25, 25], [19, 26], [12, 24]]],
      occurredAt: now - 86_400_000, kudos: 11,
      metrics: [{ label: 'Distance', value: 5.2, unit: 'km' }, { label: 'Pace', value: 5.5, unit: 'min/km' }, { label: 'Moving time', value: 29, unit: 'min' }], chart: [] },
  ];
}

export type HomePreviewMode = string | null;

export function previewFeedPhase(mode: HomePreviewMode): FeedPhase {
  switch (mode) {
    case 'feed-loading': return { kind: 'loading' };
    case 'feed-gated': return { kind: 'gated', message: 'Team Community is not available for your organization yet.' };
    case 'feed-refused': return { kind: 'refused', message: 'You do not have access to this community.' };
    case 'feed-error': return { kind: 'failed', message: 'The community feed could not be reached. Check your connection.' };
    default: return { kind: 'ready' };
  }
}
