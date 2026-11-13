import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EQUIPMENT } from '../../../lib/contracts/types';
import TrainingSetup from './TrainingSetup';
import { ACCESS_GROUPS, EQUIPMENT_LABELS, FACILITIES, LOCATION_PRESETS, chooseLocation, confirmedSetup, emptySetup, locationSetup, readRememberedSetup, rememberSetup, setGoalAccess, setupForProposal, setupFromIntake, setupErrors, setupSignature, withRequestedEquipment } from './training-access';
import { applyEquipmentChanges, equipmentChanges, suppliedWorkoutConditions } from './personal-conversation';

afterEach(() => vi.unstubAllGlobals());
describe('confirmed resource choices', () => {
  it('covers the entire shared equipment vocabulary exactly once, with readable names', () => {
    const choices = ACCESS_GROUPS.flatMap(group => [...group.equipment]);
    expect(choices).toHaveLength(EQUIPMENT.length); expect(new Set(choices).size).toBe(EQUIPMENT.length);
    expect(choices.sort()).toEqual([...EQUIPMENT].sort());
    expect(choices.every(choice => !!EQUIPMENT_LABELS[choice])).toBe(true);
  });
  it('requires an explicit resource answer and confirmation; gym grants no kit', () => {
    const draft = { ...emptySetup(), facility: 'gym' as const, participantCount: 1, confirmed: true };
    expect(confirmedSetup(draft)).toBeNull();
    const none = { ...draft, equipmentAnswered: true };
    expect(confirmedSetup(none)?.equipment).toEqual([]);
    expect(confirmedSetup({ ...none, confirmed: false })).toBeNull();
    expect(confirmedSetup(none)?.access.space).not.toHaveProperty('lengthMeters');
  });
  it('preserves known dimensions and people without replacing unanswered space with invented measurements', () => {
    const value = { ...emptySetup(), facility: 'pitch' as const, participantCount: 4, equipment: ['ball'], equipmentAnswered: true, lengthMeters: 25, confirmed: true };
    expect(confirmedSetup(value)).toEqual({ equipment: ['ball'], setting: 'partner', access: { schemaVersion: 1, confirmed: true, facility: 'pitch', participantCount: 4, space: { lengthMeters: 25, overheadClear: false, goalArea: false } } });
    expect(setupErrors({ ...value, widthMeters: -1 })).not.toEqual([]);
    expect(setupErrors({ ...value, participantCount: 13 })).not.toEqual([]);
  });
  it('remembered resources remain scoped to the owner and player, requiring fresh confirmation', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) });
    const value = { ...emptySetup(), facility: 'home' as const, participantCount: 1, equipmentAnswered: true, confirmed: true };
    rememberSetup('owner', 'player', value);
    expect(readRememberedSetup('owner', 'player')?.confirmed).toBe(false);
    expect(readRememberedSetup('another', 'player')).toBeNull();
    expect(readRememberedSetup('owner', 'another')).toBeNull();
    expect([...storage.values()][0]).not.toMatch(/pain|age|password/);
  });
  it('detects resource changes independent of checkbox ordering and confirmation', () => {
    const original = setupFromIntake({ equipment: ['wall', 'ball'], setting: 'solo' });
    expect(setupSignature(original)).toBe(setupSignature({ ...original, equipment: ['ball', 'wall'], confirmed: true }));
    expect(setupSignature(original)).not.toBe(setupSignature({ ...original, equipment: ['ball'] }));
  });
  it('does not reuse a stored confirmation, but preserves a matching setup confirmed in this visit', () => {
    const current = { ...emptySetup(), facility: 'home' as const, participantCount: 1, equipmentAnswered: true, confirmed: true };
    const intake = confirmedSetup(current)!;
    expect(setupForProposal(intake, emptySetup()).confirmed).toBe(false);
    expect(setupForProposal(intake, current).confirmed).toBe(true);
    expect(setupForProposal({ ...intake, equipment: ['mat'] }, current).confirmed).toBe(false);
  });
  it('keeps compact location presets and equipment exceptions available without checklists', () => {
    const html = renderToStaticMarkup(<TrainingSetup value={emptySetup()} onChange={() => {}} onConfirm={() => {}} />);
    for (const label of ['Soccer field', 'Technical and physical workout with the ball', 'Gym', 'At home', 'Adjust equipment', 'Use this setup']) expect(html).toContain(label);
    expect(html.indexOf('Soccer field')).toBeLessThan(html.indexOf('Gym')); expect(html.indexOf('Gym')).toBeLessThan(html.indexOf('At home'));
    expect(html).not.toContain('role="switch"'); expect(html).not.toContain('Bring your ball'); expect(html).not.toContain('A goal you can use');
    expect(html).not.toContain('Do you have a goal?'); expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('Add a drill');
  });
});
describe('soccer field goal question', () => {
  const field = chooseLocation('pitch', emptySetup());
  it('lists Soccer field first and keeps the server facility key', () => {
    expect(Object.keys(LOCATION_PRESETS)).toEqual(['pitch', 'gym', 'home']);
    expect(LOCATION_PRESETS.pitch).toMatchObject({ label: 'Soccer field', description: 'Technical and physical workout with the ball' });
    expect(FACILITIES.pitch).toBe('Football pitch');
  });
  it('assumes a ball and asks about a goal only for Soccer field', () => {
    expect(field.equipment).toContain('ball'); expect(field.equipment).not.toContain('goal');
    expect(renderToStaticMarkup(<TrainingSetup value={field} onChange={() => {}} />)).toContain('Do you have a goal?');
    for (const other of [locationSetup('gym'), locationSetup('home')]) expect(renderToStaticMarkup(<TrainingSetup value={other} onChange={() => {}} />)).not.toContain('Do you have a goal?');
  });
  it('blocks the step until the goal is answered, then Yes adds and No removes the goal', () => {
    expect(setupErrors(field)).toEqual(['Do you have a goal? Choose Yes or No.']);
    expect(confirmedSetup({ ...field, confirmed: true })).toBeNull();
    const yes = setGoalAccess(field, true), no = setGoalAccess(yes, false);
    expect(setupErrors(yes)).toEqual([]); expect(setupErrors(no)).toEqual([]);
    expect(confirmedSetup({ ...yes, confirmed: true })!.equipment).toEqual(['ball', 'cones', 'goal', 'markers', 'timer']);
    expect(confirmedSetup({ ...no, confirmed: true })!.equipment).toEqual(['ball', 'cones', 'markers', 'timer']);
    const sent = JSON.stringify(confirmedSetup({ ...yes, confirmed: true }));
    expect(sent).not.toContain('goalAnswered'); expect(JSON.parse(sent).access.facility).toBe('pitch');
    expect(setupSignature(yes)).not.toContain('goalAnswered');
  });
  it('renders the answer and asks again only when the field is newly chosen', () => {
    const yes = setGoalAccess(field, true);
    expect(renderToStaticMarkup(<TrainingSetup value={yes} onChange={() => {}} />)).toMatch(/aria-pressed="true"[^>]*>Yes</);
    expect(renderToStaticMarkup(<TrainingSetup value={setGoalAccess(field, false)} onChange={() => {}} />)).toMatch(/aria-pressed="true"[^>]*>No</);
    expect(renderToStaticMarkup(<TrainingSetup value={field} onChange={() => {}} />)).not.toContain('aria-pressed="true">Yes');
    expect(chooseLocation('pitch', yes)).toMatchObject({ goalAnswered: true }); expect(chooseLocation('pitch', yes).equipment).toContain('goal');
    const fromGym = chooseLocation('pitch', setGoalAccess(locationSetup('gym'), true));
    expect(fromGym.goalAnswered).toBe(false); expect(fromGym.equipment).not.toContain('goal'); expect(fromGym.equipment).toContain('ball');
  });
  it('carries no ball or goal to Gym or At home', () => {
    const yes = setGoalAccess(field, true);
    for (const facility of ['gym', 'home'] as const) {
      const next = chooseLocation(facility, yes);
      expect(next.equipment).not.toContain('ball'); expect(next.equipment).not.toContain('goal');
      expect(next).not.toHaveProperty('goalAnswered'); expect(setupErrors(next)).toEqual([]);
    }
  });
  it('restores remembered field setups answered, survives old drafts, and lets typed equipment answer', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) });
    for (const hasGoal of [true, false]) {
      rememberSetup('owner', 'player', { ...setGoalAccess(field, hasGoal), confirmed: true });
      const restored = readRememberedSetup('owner', 'player')!;
      expect(setupErrors(restored)).toEqual([]); expect(restored.equipment.includes('goal')).toBe(hasGoal);
      expect(renderToStaticMarkup(<TrainingSetup value={restored} onChange={() => {}} />)).toMatch(new RegExp(`aria-pressed="true"[^>]*>${hasGoal ? 'Yes' : 'No'}<`));
    }
    // An old confirmed field setup (no ball, no goal answer field) still loads without asking again.
    const old = setupFromIntake({ equipment: ['cones'], setting: 'solo', access: { schemaVersion: 1, confirmed: true, facility: 'pitch', participantCount: 1, space: {} } });
    expect(setupErrors(old)).toEqual([]);
    // The wizard's unconfirmed fallback copy of an unanswered field draft asks again.
    expect(setupFromIntake({ equipment: field.equipment, setting: 'solo', access: { facility: 'pitch', participantCount: 1, space: {} } }).goalAnswered).toBe(false);
    expect(setupForProposal(confirmedSetup({ ...setGoalAccess(field, false), confirmed: true })!, emptySetup()).goalAnswered).toBeUndefined();
    expect(withRequestedEquipment(field, 'I have a ball but do not have a goal')).toMatchObject({ goalAnswered: true });
    expect(withRequestedEquipment(field, 'I have a ball but do not have a goal').equipment).not.toContain('goal');
    expect(withRequestedEquipment(field, 'I have 20 minutes')).toMatchObject({ goalAnswered: false });
  });
});
describe('equipment text is an unconfirmed suggestion', () => {
  it.each([
    ['I have a ball but do not have a goal', ['ball'], ['goal']],
    ['I have a mat but no access to a goal', ['mat'], ['goal']],
    ['I have a ball and no resistance band', ['ball'], ['resistanceBand']],
    ["I don't have a wall anymore", [], ['wall']],
    ['No wall today', [], ['wall']],
    ['I have a medicine ball', ['medicineBall'], []],
  ])('%s', (text, add, remove) => {
    expect(equipmentChanges(text)).toMatchObject({ add, remove });
  });
  it('removes unavailable equipment from a previous setup without discarding unaffected equipment', () => {
    expect(applyEquipmentChanges(['ball', 'cones', 'wall'], 'No wall today')).toEqual(['ball', 'cones']);
    expect(applyEquipmentChanges(['ball', 'cones'], 'I only have a mat')).toEqual(['mat']);
    expect(applyEquipmentChanges(['ball', 'wall'], 'No equipment')).toEqual([]);
    expect(suppliedWorkoutConditions('Give me a wall passing workout')).not.toHaveProperty('equipment');
  });
});
