/** The same tenth-of-a-minute precision used by saved workout notifications.
 * App-use estimates and prescribed durations have separate meanings. */
export function workoutMinutes(minutes: number): string {
  return Number.isFinite(minutes) && minutes >= 0
    ? `${(Math.round(minutes * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 })} min`
    : 'Not recorded';
}
