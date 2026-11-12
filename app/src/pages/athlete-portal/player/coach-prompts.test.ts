import { describe, expect, it } from 'vitest';
import { coachGreeting, coachPrompts, coachToolPhrase, coachToolStatus } from './coach-prompts';

describe('contextual coach entry points', () => {
  it('distinguishes building a session from changing a selected session', () => {
    expect(coachPrompts('workout_chat', { kind: 'new' })[0]).toContain('Build a session');
    expect(coachPrompts('workout_chat', { kind: 'plan' })[0]).toContain('Shorten this workout');
    expect(coachPrompts('coaching_chat')[0]).toContain('this drill');
    expect(coachPrompts('pose_chat')[1]).toContain('assigned workout');
  });
  it('describes work without exposing internal tool identifiers', () => {
    expect(coachToolStatus('load_workout_schedule_v3', false)).toBe('Checking your training…');
    expect(coachToolStatus('read_qualified_results', true)).toBe('Checked your progress.');
    expect(coachToolStatus(undefined, false)).toBe('Checking your request…');
  });
  it('uses the app Coach tab phrases for running tools', () => {
    expect(coachToolPhrase('fetch_rep_metrics')).toBe('reading your reps…');
    expect(coachToolPhrase('search_drills')).toBe('Finding drills…');
    expect(coachToolPhrase('search_drill_catalog')).toBe('Finding drills…');
    expect(coachToolPhrase('search_knowledge')).toBe('Checking training guidance…');
    expect(coachToolPhrase('build_workout')).toBe('Building your workout…');
    expect(coachToolPhrase('adjust_workout')).toBe('Updating your workout…');
    expect(coachToolPhrase('show_visual')).toBe('Pulling that up…');
    expect(coachToolPhrase('load_workout_schedule_v3')).toBe('Checking the details…');
    expect(coachToolPhrase(undefined)).toBe('Checking the details…');
  });
  it('greets the athlete by first name, as the app does', () => {
    expect(coachGreeting('Sam Rivera')).toBe('Ready, Sam?');
    expect(coachGreeting('  ')).toBe('What are we working on?');
    expect(coachGreeting(undefined)).toBe('What are we working on?');
  });
});
