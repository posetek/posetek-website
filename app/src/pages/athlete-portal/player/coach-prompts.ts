import type { Row } from './execution';

export function coachPrompts(capability: string, target?: Row): string[] {
  if (capability === 'coaching_chat') return ['Explain this drill step by step', 'What should I focus on during each set?', 'How can I tell if I am doing this correctly?'];
  if (capability === 'workout_chat') return target?.kind === 'new'
    ? ['Build a session for the time I have', 'I have only a ball and a small space', 'Give me a lighter session today']
    : ['Shorten this workout to 20 minutes', 'Suggest an alternative with less equipment', 'Explain why these drills are in my workout'];
  return ['Help me plan 20 minutes of training', 'Explain my next assigned workout', 'How has my training progressed?'];
}

/**
 * The Coach tab's running-tool line, word for word from the app (`AIChatSurface.toolPhrase`).
 * The workout builder's two tools use `CoachBuilderActivity.phrase`.
 */
export function coachToolPhrase(name: unknown): string {
  switch (name) {
    case 'fetch_rep_metrics': return 'reading your reps…';
    case 'fetch_pose_artifact': return 'looking at your pose data…';
    case 'fetch_benchmark': return 'checking the benchmark…';
    case 'search_drill_catalog': case 'search_drills': return 'Finding drills…';
    case 'get_drill_history': return 'Checking recent training…';
    case 'search_athlete_history': return 'Looking back at your training…';
    case 'search_training_research': case 'search_knowledge': return 'Checking training guidance…';
    case 'build_workout': return 'Building your workout…';
    case 'adjust_workout': return 'Updating your workout…';
    case 'show_visual': return 'Pulling that up…';
    default: return 'Checking the details…';
  }
}

/** The Coach tab's welcome line for the athlete (`AICoachTabView.greeting`). */
export function coachGreeting(playerName: unknown): string {
  const first = typeof playerName === 'string' ? playerName.trim().split(/\s+/)[0] || '' : '';
  return first ? `Ready, ${first}?` : 'What are we working on?';
}

export function coachToolStatus(name: unknown, finished: boolean): string {
  const label = typeof name === 'string' && /catalog|drill/.test(name) ? 'suitable exercises'
    : typeof name === 'string' && /plan|workout|schedule/.test(name) ? 'your training'
    : typeof name === 'string' && /result|stat|evidence/.test(name) ? 'your progress' : 'your request';
  return `${finished ? 'Checked' : 'Checking'} ${label}${finished ? '.' : '…'}`;
}
