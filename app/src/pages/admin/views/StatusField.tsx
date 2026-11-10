// The catalog status select: the drill editor's field, the drill page's
// status-only control and each yoga pose row share it, so the validation
// publish gate looks and behaves the same everywhere.

import { publishTransitionBlocked } from "../../../lib/contracts/drillV2";
import type { CatalogValidation } from "../../../lib/contracts/drillV2";
import { DRILL_STATUSES } from "../../../lib/contracts/types";
import type { DrillStatus } from "../../../lib/contracts/types";

export function StatusField({ value, validation, loadedStatus, managed, onChange, disabled = false, compact = false, label }: {
  /** null only for a yoga document that carries no valid status. */
  value: DrillStatus | null;
  validation?: CatalogValidation;
  /** The status the page loaded; absent when creating. */
  loadedStatus?: DrillStatus | null;
  managed: boolean;
  onChange: (value: DrillStatus) => void;
  disabled?: boolean;
  /** No visible label: the select alone, for a list row or a heading. */
  compact?: boolean;
  /** The compact select's accessible name, naming what it changes ("Boat status"). */
  label?: string;
}) {
  const awaitingValidation = publishTransitionBlocked("published", loadedStatus ?? undefined, validation);
  const select = (
    <select
      value={value ?? ""}
      disabled={disabled}
      aria-label={compact ? label ?? "Status" : undefined}
      onChange={event => onChange(event.target.value as DrillStatus)}
    >
      {value === null && <option value="" disabled>—</option>}
      {DRILL_STATUSES.map(option => (
        <option key={option} value={option} disabled={option === "published" && (managed || awaitingValidation)}>{option}</option>
      ))}
    </select>
  );
  if (compact) return select;
  return (
    <label className="admin-field">
      <span>Status</span>
      {select}
      {awaitingValidation && <small className="admin-note">Publishes automatically when validation passes.</small>}
    </label>
  );
}
