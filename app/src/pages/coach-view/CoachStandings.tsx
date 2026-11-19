import { useState } from "react";

type Metric = {
  label: string;
  result: string | null;
  average?: string | null;
  count?: number | null;
  percentile?: number | null;
  band?: string;
};
export type OnePager = {
  date: string;
  comparisonLabel: string;
  metrics: Metric[];
  notes: string[];
};

const bands = { strong: "Strong", middle: "Average", practice: "Weak" } as const;

function testName(label: string) {
  const aliases: Record<string, string> = {
    "Recorded sprint": "Sprint", "Left-course dribble": "Left dribble", "Right-course dribble": "Right dribble",
  };
  return aliases[label] ?? label;
}

function ordinal(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n}${suffix}`;
}

export function CoachStandings({ athletes }: { athletes: { name: string; report?: OnePager }[] }) {
  const tests = [...new Set(athletes.flatMap(a => a.report?.metrics.map(m => testName(m.label)) ?? []))];
  const [selection, setSelection] = useState("Vertical jump");
  const test = tests.includes(selection) ? selection : tests[0];
  const rows = athletes.map(a => ({ name: a.name, metric: a.report?.metrics.find(m => testName(m.label) === test) }));
  rows.sort((a,b) => (b.metric?.percentile ?? -1) - (a.metric?.percentile ?? -1) || a.name.localeCompare(b.name));
  return <section className="insights-card cv-standings">
    <div className="card-heading"><div><h2>Team standings</h2><p>Team percentiles from each athlete’s testing session</p></div>
      {tests.length > 0 && <label className="cv-test-select">Test <select value={test} onChange={e => setSelection(e.target.value)}>
        {tests.map(option => <option key={option}>{option}</option>)}</select></label>}
    </div>
    <div className="cv-standing-scroll" tabIndex={0} role="region" aria-label={`${test ?? "Test"} standings`}>
      <ol className="cv-columns" style={{minWidth: rows.length * 74}}>
        {rows.map(({name, metric}) => <li key={name} data-band={metric?.band}>
          <div className="cv-column"><div className="cv-column-fill" style={{height: `${metric?.percentile ?? 0}%`}}>
            <b>{metric?.percentile != null ? ordinal(metric.percentile) : "—"}</b>
          </div></div>
          <strong>{name}</strong><small>{metric?.result ?? "Unscored"}</small>
        </li>)}
      </ol>
    </div>
    <div className="cv-legend">{Object.entries(bands).map(([key,label]) => <span data-band={key} key={key}><i/>{label}</span>)}
      {rows.some(r => r.metric?.percentile == null) && <span>— Unranked</span>}
    </div>
  </section>;
}

export function ReportBody({ report }: { report: OnePager }) {
  return <>
    <p className="cv-date">Tested {report.date}</p>
    <div className="cv-scores">{report.metrics.map(m => <div className="cv-score" data-band={m.band} key={m.label}>
      <div className="cv-score-title"><strong>{testName(m.label)}</strong><b>{m.result ?? "Unavailable"}</b></div>
      <div className="cv-meter" aria-hidden="true">{m.percentile != null && <i style={{width: `${m.percentile}%`}}/>}</div>
      <div className="cv-score-meta"><strong>{m.percentile != null ? `${ordinal(m.percentile)} percentile` : "Unranked"}</strong>
        {m.average && <span>{report.comparisonLabel} {m.average}{m.count ? ` · n=${m.count}` : ""}</span>}
      </div>
    </div>)}</div>
    <dl className="cv-bands">{Object.entries(bands).map(([key,label]) => {
      const tests = report.metrics.filter(m => m.percentile != null && m.band === key).map(m => testName(m.label));
      return <div data-band={key} key={key}><dt>{label}</dt><dd>{tests.join(" · ") || "None"}</dd></div>;
    })}</dl>
    {report.notes.length > 0 && <details className="cv-notes"><summary>Measurement notes</summary><ul>{report.notes.map((note,i) => <li key={i}>{note}</li>)}</ul></details>}
  </>;
}
