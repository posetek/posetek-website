import { useId, useState } from "react";
import { rosterName, type OrganizationSeries, type SharedTeam } from "./reportData";

const numbers = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const basisLabels = { "team-band": "Team age band", "recorded-age": "Age at testing" };
const units: Record<OrganizationSeries["unit"], string> = {
  "m/s": "Speed · metres per second", mph: "Speed · miles per hour", s: "Elapsed time · seconds",
  in: "Height · inches", ft: "Distance · feet", m: "Distance · metres", cm: "Distance · centimetres",
};
const gaps = { unavailable: "No published mean", "small-group": "Under 5 players", incompatible: "Different protocol" };

export function OrganizationPathway({ team }: { team: SharedTeam }) {
  const data = team.organizationPathway!;
  const [selectedTest, setTest] = useState("");
  const [selectedBasis, setBasis] = useState<OrganizationSeries["ageBasis"]>("team-band");
  const [selectedUnit, setUnit] = useState("");
  const id = useId();
  const tests = [...new Set(data.series.map(row => row.test))];
  const test = tests.includes(selectedTest) ? selectedTest : tests[0];
  const related = data.series.filter(row => row.test === test);
  const bases = [...new Set(related.map(row => row.ageBasis))];
  const basis = bases.includes(selectedBasis) ? selectedBasis : bases[0];
  const series = related.filter(row => row.ageBasis === basis);
  const selected = series.find(row => row.unit === selectedUnit) ?? series[0];
  if (!selected) return <p className="cr-chart-note">No organization comparisons have been published.</p>;
  const max = Math.max(...selected.groups.map(point => point.mean ?? 0), selected.teamMean ?? 0);
  return <section className="cr-org-pathway" aria-labelledby={id}>
    <div className="cr-org-heading"><h3 id={id}>{team.club} pathway</h3><small>Sources through {data.through}</small></div>
    <div className="cr-chart-filters cr-org-filters">
      <label>Test<select aria-label="Test" value={test} onChange={e => setTest(e.target.value)}>{tests.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>Group by<select aria-label="Group by" value={basis} onChange={e => setBasis(e.target.value as OrganizationSeries["ageBasis"])}>{bases.map(b => <option value={b} key={b}>{basisLabels[b]}</option>)}</select></label>
      {series.length > 1 && <label>Measure<select aria-label="Measure" value={selected.unit} onChange={e => setUnit(e.target.value)}>{series.map(r => <option key={r.unit} value={r.unit}>{units[r.unit]}</option>)}</select></label>}
    </div>
    <p className="cr-pathway-axis">{units[selected.unit]}</p>
    <p className="cr-org-description">{selected.description}</p>
    <div className="cr-org-chart" role="region" aria-label={basisLabels[basis] + " averages"}>
      <div className="cr-org-row cr-org-labels" aria-hidden="true"><span>{basis === "team-band" ? "Band" : "Age"}</span><span>Mean</span><span>Players</span></div>
      <ul>{selected.groups.map(point => <li key={point.age} className="cr-org-row" data-age={point.age} data-status={point.status}>
        <strong>{basis === "team-band" ? "U" : ""}{point.age}</strong>
        {point.status === "published" && point.mean != null
          ? <div className="cr-org-result"><i aria-hidden="true" style={{ width: point.mean / max * 100 + "%" }}/><b>{numbers.format(point.mean)} {selected.unit}</b></div>
          : <span className="cr-org-gap">{point.status !== "published" && gaps[point.status]}</span>}
        <span>{point.count ?? "—"}</span>
      </li>)}</ul>
    </div>
    <p className="cr-chart-note">{selected.teamMean == null ? "No comparable team reference." :
      <>{rosterName(team)} reference <strong>{numbers.format(selected.teamMean)} {selected.unit}</strong> · {selected.teamCount} players</>}</p>
  </section>;
}
