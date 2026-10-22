import { useRef } from "react";
import type { ReactNode } from "react";
import type { WorkspaceReportView } from "../lib/adminNavigation";
import { AGE_BANDS, DIVISIONS, USAGE_FEATURES, ageLabel, divisionLabel } from "../../insights/lib/expandedQuery";
import type { ExpandedRequest } from "../../insights/lib/expandedQuery";
import { FEATURE_LABELS, TESTING_LABELS, WORKOUT_LABELS, USAGE_LABELS } from "../../insights/lib/expanded";

type View = "list" | WorkspaceReportView;
export function DirectoryWorkspaceTabs({ active, listLabel, onChange }: { active: View; listLabel: string; onChange(view: View): void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const views: [View, string][] = [["list", listLabel], ["overview", "Overview"], ["testing", "Testing"], ["workouts", "Workouts"], ["usage", "Usage"]];
  return <div className="workspace-report-tabs directory-workspace-tabs" role="tablist" aria-label="Directory and reporting views">{views.map(([view, label], index) => <button type="button" key={view}
    ref={node => { refs.current[index] = node; }} id={`workspace-report-tab-${view}`} role="tab" aria-selected={active === view}
    aria-controls={`workspace-report-panel-${view}`} tabIndex={active === view ? 0 : -1} onClick={() => onChange(view)} onKeyDown={event => {
      const next = event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : event.key === "ArrowRight" ? (index + 1) % views.length : event.key === "ArrowLeft" ? (index + views.length - 1) % views.length : undefined;
      if (next !== undefined) { event.preventDefault(); refs.current[next]?.focus(); }
    }}>{label}</button>)}</div>;
}

/** Every option maps to an existing reporting filter; identity lookup remains separate. */
export function DirectoryPlayerFilters({ request, onChange }: { request: ExpandedRequest; onChange(patch: Partial<ExpandedRequest>): void }) {
  const fields: { key: "division" | "ageBand" | "testingStatus" | "workoutStatus" | "usageStatus" | "usagePlatform" | "usageFeature" | "teamAssignment"; label: string; values: [string, string][] }[] = [
    { key: "division", label: "Division", values: DIVISIONS.map(key => [key, divisionLabel(key)]) },
    { key: "ageBand", label: "Age", values: AGE_BANDS.map(key => [key, ageLabel(key)]) },
    { key: "teamAssignment", label: "Team assignment", values: [["assigned", "Assigned"], ["unassigned", "Unassigned"]] },
    { key: "testingStatus", label: "Testing status", values: Object.entries(TESTING_LABELS) },
    { key: "workoutStatus", label: "Workout status", values: Object.entries(WORKOUT_LABELS) },
    { key: "usageStatus", label: "Engagement", values: Object.entries(USAGE_LABELS) },
    { key: "usagePlatform", label: "Usage platform", values: [["web", "Website only"], ["ios", "iOS only"], ["both", "Both at once"]] },
    { key: "usageFeature", label: "Usage feature", values: USAGE_FEATURES.map(key => [key, FEATURE_LABELS[key] || key]) },
  ];
  return <fieldset className="directory-player-filters"><legend>Filter included players</legend><p className="admin-note">These filters open the reporting player list in this scope. They do not search email addresses or change membership.</p>{fields.map(field => <label key={field.key}><span>{field.label}</span><select aria-label={field.label} value={request[field.key]} onChange={event => onChange({ [field.key]: event.target.value })}><option value="">All</option>{field.values.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</fieldset>;
}

/** Native dialog supplies focus containment and Escape; the opener remains stable across filter updates. */
export function DirectoryFilters({ children, summary }: { children: ReactNode; summary: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={opener} type="button" className="quiet-button directory-filter-trigger" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M10 15v6" /></svg>Filters & period
    </button>
    <dialog ref={dialog} className="directory-filter-dialog" aria-modal="true" aria-labelledby="directory-filter-title" onClose={() => opener.current?.focus({ preventScroll: true })} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]')].filter(node => node.getClientRects().length);
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
    }}>
      <div className="directory-filter-heading"><div><p className="eyebrow">Current selection</p><h2 id="directory-filter-title">Filters & period</h2></div><button type="button" className="icon-button" aria-label="Close filters" onClick={() => dialog.current?.close()}><span aria-hidden="true">×</span></button></div>
      <p className="admin-note">{summary}</p><div className="directory-filter-body">{children}</div>
      <div className="directory-filter-footer"><button type="button" className="primary-cta" onClick={() => dialog.current?.close()}>Done</button></div>
    </dialog>
  </>;
}
