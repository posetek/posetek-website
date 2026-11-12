import { EQUIPMENT } from '../../../lib/contracts/types';
import type { Row } from './execution';
import { applyEquipmentChanges, equipmentChanges } from './personal-conversation';

export const EQUIPMENT_LABELS: Record<string, string> = {
  ball: 'Football', cones: 'Cones', markers: 'Flat markers', wall: 'Wall for rebound passes', goal: 'Goal',
  hurdles: 'Hurdles', box: 'Stable exercise box', sledOrBand: 'Resistance sled / sprint band', timer: 'Timer',
  bench: 'Stable exercise bench', mat: 'Exercise mat', kneePad: 'Knee pad', tapeMeasure: 'Measuring tape', cueDevice: 'Cue device',
  dumbbells: 'Dumbbells', barbell: 'Barbell', weightPlates: 'Weight plates', squatRack: 'Squat rack', trapBar: 'Trap bar',
  kettlebell: 'Kettlebell', cableMachine: 'Cable machine', resistanceBand: 'Resistance band', medicineBall: 'Medicine ball',
  pullUpBar: 'Pull-up bar', legCurlMachine: 'Leg-curl machine', legPressMachine: 'Leg-press machine', jumpRope: 'Jump rope', sliders: 'Sliders',
};
export const ACCESS_GROUPS = [
  { id: 'space', label: 'Space & people', equipment: [] as string[] },
  { id: 'football', label: 'Football', equipment: ['ball', 'cones', 'markers', 'wall', 'goal'] },
  { id: 'strength', label: 'Strength', equipment: ['bench', 'dumbbells', 'barbell', 'weightPlates', 'squatRack', 'trapBar', 'kettlebell', 'cableMachine', 'resistanceBand', 'medicineBall', 'pullUpBar', 'legCurlMachine', 'legPressMachine'] },
  { id: 'movement', label: 'Movement', equipment: ['mat', 'kneePad', 'box', 'hurdles', 'jumpRope', 'sliders', 'sledOrBand'] },
  { id: 'timing', label: 'Timing & cues', equipment: ['timer', 'tapeMeasure', 'cueDevice'] },
] as const;
export const FACILITIES = { home: 'Home', gym: 'Gym', outdoor: 'Outdoors', pitch: 'Football pitch', other: 'Another location' };
export const SURFACES = { indoor: 'Indoor floor', grass: 'Grass', turf: 'Turf', hardcourt: 'Hard court', track: 'Running track', other: 'Another surface' };
export type TrainingAccess = { schemaVersion: 1; confirmed: true; facility: keyof typeof FACILITIES;
  participantCount: number; space: { lengthMeters?: number; widthMeters?: number; surface?: keyof typeof SURFACES; overheadClear?: boolean; goalArea?: boolean; assumedSufficient?: boolean } };
export type SetupDraft = { equipment: string[]; equipmentAnswered: boolean; facility: keyof typeof FACILITIES | '';
  participantCount: number | ''; lengthMeters: number | ''; widthMeters: number | ''; surface: keyof typeof SURFACES | '';
  overheadClear: boolean; goalArea: boolean; confirmed: boolean; assumedSufficient?: boolean; overheadConfirmed?: boolean; goalAreaConfirmed?: boolean;
  /** Client-only: `false` while a fresh Soccer field choice still needs its goal answer. Never sent. */
  goalAnswered?: boolean };
export const LOCATION_PRESETS = {
  pitch: { label: 'Soccer field', icon: 'sports_soccer', description: 'Technical and physical workout with the ball', equipment: ['cones', 'markers', 'timer'] },
  gym: { label: 'Gym', icon: 'fitness_center', description: 'Weights, bands and a bench', equipment: ['dumbbells', 'resistanceBand', 'kettlebell', 'bench', 'timer'] },
  home: { label: 'At home', icon: 'home', description: 'Bodyweight and floor exercises', equipment: ['timer'] },
} as const;
/** A location's bundle. Gym and At home carry no ball or goal over from a field choice. */
export function locationSetup(facility: keyof typeof LOCATION_PRESETS, previous = emptySetup()): SetupDraft {
  const { goalAnswered, ...rest } = previous, stays = facility === 'pitch' && previous.facility === 'pitch';
  const ballAndGoal = facility === 'pitch' ? previous.equipment.filter(e => e === 'ball' || e === 'goal') : [];
  return { ...rest, facility, equipment: [...LOCATION_PRESETS[facility].equipment, ...ballAndGoal], equipmentAnswered: true,
    participantCount: previous.participantCount || 1, assumedSufficient: true, confirmed: false,
    ...(stays && goalAnswered !== undefined ? { goalAnswered } : {}) };
}
/** Tapping Soccer field assumes the ball and asks about a goal, unless the field was already chosen. */
export function chooseLocation(facility: keyof typeof LOCATION_PRESETS, previous: SetupDraft): SetupDraft {
  const next = locationSetup(facility, previous);
  if (facility !== 'pitch') return next;
  const stays = previous.facility === 'pitch', goal = stays && previous.equipment.includes('goal') ? ['goal'] : [];
  return { ...next, equipment: [...new Set([...next.equipment.filter(e => e !== 'ball' && e !== 'goal'), 'ball', ...goal])],
    goalAnswered: stays && previous.goalAnswered !== false };
}
export function setGoalAccess(value: SetupDraft, hasGoal: boolean): SetupDraft {
  const equipment = value.equipment.filter(e => e !== 'goal');
  return { ...value, equipment: hasGoal ? [...equipment, 'goal'] : equipment, equipmentAnswered: true, goalAnswered: true, confirmed: false };
}
/** Applies a typed request's equipment; one that says whether a goal is available answers the goal question. */
export function withRequestedEquipment(next: SetupDraft, request: string): SetupDraft {
  const changes = equipmentChanges(request), mentionsGoal = changes.add.includes('goal') || changes.remove.includes('goal');
  return { ...next, equipment: applyEquipmentChanges(next.equipment, request), ...(next.goalAnswered === false && mentionsGoal ? { goalAnswered: true } : {}) };
}
export function clearSpaceRestrictions(value: SetupDraft): SetupDraft {
  const { overheadConfirmed: _overhead, goalAreaConfirmed: _goal, ...rest } = value;
  return { ...rest, lengthMeters: '', widthMeters: '', surface: '', overheadClear: false, goalArea: false, assumedSufficient: true, confirmed: false };
}
export const emptySetup = (): SetupDraft => ({ equipment: [], equipmentAnswered: false, facility: '', participantCount: '',
  lengthMeters: '', widthMeters: '', surface: '', overheadClear: false, goalArea: false, confirmed: false });
export function setupFromIntake(intake?: Row): SetupDraft {
  const access = intake?.access, equipment: string[] = Array.isArray(intake?.equipment) ? intake.equipment.filter((e: string) => (EQUIPMENT as readonly string[]).includes(e)) : [];
  // A confirmed field setup answered the goal question; only an unconfirmed
  // saved draft without a goal still needs that answer.
  const goalUnanswered = access?.facility === 'pitch' && access?.confirmed !== true && !equipment.includes('goal');
  return { ...emptySetup(), equipment, ...(goalUnanswered ? { goalAnswered: false } : {}),
    equipmentAnswered: Array.isArray(intake?.equipment), facility: access?.facility in FACILITIES ? access.facility : '',
    participantCount: Number.isInteger(access?.participantCount) ? access.participantCount : intake?.setting === 'solo' ? 1 : intake?.setting === 'partner' ? 2 : '',
    lengthMeters: access?.space?.lengthMeters ?? '', widthMeters: access?.space?.widthMeters ?? '',
    surface: access?.space?.surface in SURFACES ? access.space.surface : '', overheadClear: access?.space?.overheadClear === true,
    goalArea: access?.space?.goalArea === true, ...(access?.space?.assumedSufficient === true ? { assumedSufficient: true } : {}),
    ...(typeof access?.space?.overheadClear === 'boolean' ? { overheadConfirmed: true } : {}),
    ...(typeof access?.space?.goalArea === 'boolean' ? { goalAreaConfirmed: true } : {}) };
}
export function setupErrors(value: SetupDraft): string[] {
  const errors: string[] = [];
  if (!(value.facility in FACILITIES)) errors.push('Choose where you will train.');
  if (value.facility === 'pitch' && value.goalAnswered === false) errors.push('Do you have a goal? Choose Yes or No.');
  if (!Number.isInteger(value.participantCount) || Number(value.participantCount) < 1 || Number(value.participantCount) > 12) errors.push('Choose how many people will train, including you (1–12).');
  if (!value.equipmentAnswered) errors.push('Select your available equipment, or choose No equipment.');
  if (value.equipment.some(e => !(EQUIPMENT as readonly string[]).includes(e))) errors.push('Choose equipment from the listed options.');
  for (const field of ['lengthMeters', 'widthMeters'] as const) if (value[field] !== '' && (!Number.isFinite(value[field]) || Number(value[field]) <= 0 || Number(value[field]) > 1000)) errors.push('Use a space measurement above 0 and no more than 1,000 metres, or leave it blank.');
  if (value.surface && !(value.surface in SURFACES)) errors.push('Choose a listed surface.');
  return errors;
}
export function confirmedSetup(value: SetupDraft): { equipment: string[]; setting: 'solo' | 'partner'; access: TrainingAccess } | null {
  if (!value.confirmed || setupErrors(value).length) return null;
  return { equipment: [...new Set(value.equipment)].sort(), setting: value.participantCount === 1 ? 'solo' : 'partner',
    access: { schemaVersion: 1, confirmed: true, facility: value.facility as TrainingAccess['facility'], participantCount: Number(value.participantCount),
      space: { ...(value.lengthMeters !== '' ? { lengthMeters: value.lengthMeters } : {}), ...(value.widthMeters !== '' ? { widthMeters: value.widthMeters } : {}),
        ...(value.surface ? { surface: value.surface } : {}), ...(value.assumedSufficient ? { assumedSufficient: true } : {}),
        ...(!value.assumedSufficient || value.overheadConfirmed || value.overheadClear ? { overheadClear: value.overheadClear } : {}),
        ...(!value.assumedSufficient || value.goalAreaConfirmed || value.goalArea ? { goalArea: value.goalArea } : {}) } } };
}
export function setupSignature(value: SetupDraft): string {
  const canonical = confirmedSetup({ ...value, confirmed: true });
  return JSON.stringify(canonical || { ...value, equipment: [...value.equipment].sort(), confirmed: false });
}
export function setupForProposal(intake: Row, current: SetupDraft): SetupDraft {
  const next = setupFromIntake(intake);
  // A server draft records the setup used to prescribe it, not a fresh check
  // of what is available now. Keep only a matching confirmation from this visit.
  return { ...next, confirmed: current.confirmed && setupSignature(current) === setupSignature(next) };
}
export function setupSummary(value: SetupDraft): string {
  return [value.facility ? FACILITIES[value.facility] : 'Location not set', value.participantCount === 1 ? 'Solo' : value.participantCount ? `${value.participantCount} people` : 'People not set',
    value.equipmentAnswered ? value.equipment.length ? value.equipment.map(e => EQUIPMENT_LABELS[e] || e).join(', ') : 'No equipment' : 'Equipment not set'].join(' · ');
}
// Only resource preferences are remembered; age, pain answers, credentials and
// confirmation are not. The owner/player key prevents another account inheriting them.
export const setupStorageKey = (uid: string, playerId: string) => `posetek:training-setup:${encodeURIComponent(uid)}:${encodeURIComponent(playerId)}`;
export function readRememberedSetup(uid: string, playerId: string): SetupDraft | null {
  if (!uid || typeof localStorage === 'undefined') return null;
  try {
    const row = JSON.parse(localStorage.getItem(setupStorageKey(uid, playerId)) || 'null');
    if (row?.schemaVersion !== 1 || row.uid !== uid || row.playerId !== playerId) return null;
    const draft = setupFromIntake(row.intake);
    return setupErrors(draft).length ? null : draft;
  } catch { return null; }
}
export function rememberSetup(uid: string, playerId: string, draft: SetupDraft) {
  const intake = confirmedSetup(draft);
  if (!uid || !intake || typeof localStorage === 'undefined') return;
  try { localStorage.setItem(setupStorageKey(uid, playerId), JSON.stringify({ schemaVersion: 1, uid, playerId, intake })); } catch { /* Session confirmation still works without browser storage. */ }
}
