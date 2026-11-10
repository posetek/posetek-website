// The admin console's tab strip, extracted from the directory's tabs so every
// tabbed admin page shares one keyboard model: one tab in the Tab order (roving
// tabIndex), ArrowLeft/ArrowRight/Home/End move focus, Enter/Space or a click
// selects, and each tab names its panel (`{idPrefix}-tab-{id}` controls
// `{idPrefix}-panel-{id}`). The page renders the matching `role="tabpanel"`s.

import { useRef } from "react";

export default function AdminTabs<T extends string>({ tabs, active, onChange, label, idPrefix, className }: {
  tabs: readonly (readonly [T, string])[];
  active: T;
  onChange(tab: T): void;
  label: string;
  idPrefix: string;
  className: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className={className} role="tablist" aria-label={label}>{tabs.map(([id, text], index) => <button key={id} type="button" ref={element => { buttons.current[index] = element; }}
    id={`${idPrefix}-tab-${id}`} role="tab" aria-selected={active === id} aria-controls={`${idPrefix}-panel-${id}`} tabIndex={active === id ? 0 : -1}
    onClick={() => onChange(id)} onKeyDown={event => {
      let next: number | undefined;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); buttons.current[next]?.focus(); }
    }}>{text}</button>)}</div>;
}
