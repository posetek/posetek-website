// Coach View prototype: one condensed page per team for coaches.
// The example uses demo data. The development preview can load a local team snapshot.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../../lib/firebase";
import Chart from "chart.js/auto";
import { CHART_AXIS, CHART_THEME } from "../insights/chartTheme";
import { ATHLETES, BOTTOM, NEEDS_ATTENTION, TOP, byId, hours, type Athlete } from "./coachViewData";
import "../../styles/pose-portal.css";
import "../../styles/admin-theme.scss";
import "../insights/insights.scss";
import "./coach-view.scss";
import { athleteCheckIn, CoachFollowUp } from "./CoachFollowUp";
import { CoachStandings } from "./CoachStandings";

import { CoachRoster, type RosterAthlete } from "./CoachRoster";

type ChartPoint = { name: string; value: number; color: string };
type SnapshotAthlete = RosterAthlete & { activeDays: number; activeDays7d: number; workouts7d: number };
type TeamSnapshot = { team: string; club: string; asOf: string; athletes: SnapshotAthlete[] };

const topIds = new Set(TOP.map(a => a.id)), bottomIds = new Set(BOTTOM.map(a => a.id));

const samplePoints = ATHLETES.map(a => ({
  name: a.name,
  value: a.performance,
  color: topIds.has(a.id) ? CHART_THEME.accent : bottomIds.has(a.id) ? CHART_THEME.danger : CHART_THEME.neutral,
}));

function PerformanceChart({ points = samplePoints, metric = "Performance", max = 100 }: {
  points?: ChartPoint[]; metric?: string; max?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, {
      type: "line",
      data: {
        labels: points.map(a => a.name),
        datasets: [{
          data: points.map(a => a.value),
          showLine: false, clip: false,
          pointRadius: 6, pointHoverRadius: 8,
          pointBackgroundColor: points.map(a => a.color),
          pointBorderColor: CHART_THEME.surface, pointBorderWidth: 2,
        }],
      },
      options: {
        maintainAspectRatio: false, layout: { padding: { top: 12, right: 10, bottom: 4 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => points[items[0].dataIndex].name, label: item => `${metric}: ${item.parsed.y}` } } },
        scales: {
          x: { ...CHART_AXIS, offset: true, grid: { display: false }, ticks: { ...CHART_AXIS.ticks, autoSkip: false, maxRotation: 60 } },
          y: { ...CHART_AXIS, min: 0, max, title: { display: true, text: metric, color: CHART_THEME.text }, ticks: { ...CHART_AXIS.ticks, precision: 0 } },
        },
      },
    });
    return () => chart.destroy();
  }, [points, metric, max]);
  return <div className="cv-chart-scroll" tabIndex={0} aria-label={`${metric} chart, scroll horizontally for more athletes`}><div className="cv-chart" style={{ minWidth: points.length * 67 + 50 }}><canvas ref={canvas} aria-label={`${metric} by athlete`} role="img" /></div></div>;
}

function AthleteTable({ title, tone, athletes }: { title: string; tone: "top" | "bottom"; athletes: Athlete[] }) {
  return (
    <section className="insights-card cv-table-card">
      <p className={`eyebrow cv-${tone}`}>{title}</p>
      <table className="cv-table">
        <thead><tr><th>Athlete</th><th>Time</th><th>Workouts</th><th>Consistency</th></tr></thead>
        <tbody>{athletes.map(a => (
          <tr key={a.id}><td>{a.name}</td><td>{hours(a.minutes)}</td><td>{a.workouts}</td><td>{a.consistency}%</td></tr>
        ))}</tbody>
      </table>
    </section>
  );
}

const demoAttention = NEEDS_ATTENTION.map(item => ({ ...item, name: byId(item.athleteId).name }));
const exampleTeam: TeamSnapshot = {
  team: "Varsity squad", club: "Example team", asOf: "Nov 15, 2026",
  athletes: ATHLETES.map((a, i) => ({
    name: a.name, activeDays: i % 8, activeDays7d: i % 3, workouts: a.workouts, workouts7d: i % 3, testingAttempts: 3,
    report: {
      date: "Nov 10, 2026", comparisonLabel: "Example average",
      metrics: [
        { label: "Left dribble", result: `${(6 + i / 20).toFixed(2)} s`, average: "6.65 s" },
        { label: "Right dribble", result: `${(6.8 - i / 40).toFixed(2)} s`, average: "6.52 s" },
        { label: "Vertical jump", result: `${32 + i % 9} cm`, average: "35 cm" },
      ],
      notes: [],
    },
  })),
};

// Midpoint rank keeps tied measurements together in the fictional team.
for (const athlete of exampleTeam.athletes) {
  for (const metric of athlete.report!.metrics) {
    const results = exampleTeam.athletes.map(peer =>
      parseFloat(peer.report!.metrics.find(m => m.label === metric.label)!.result!)
    );
    const result = parseFloat(metric.result!);
    const behind = results.filter(value => metric.label === "Vertical jump" ? value < result : value > result).length;
    const ties = results.filter(value => value === result).length;
    const rank = (behind + ties / 2) / results.length;
    metric.percentile = Math.round(rank * 100);
    metric.band = rank >= 0.75 ? "strong" : rank < 0.25 ? "practice" : "middle";
    const unit = metric.result!.split(" ").pop();
    const mean = results.reduce((sum,value) => sum + value, 0) / results.length;
    metric.average = `${mean.toFixed(2)} ${unit}`;
    metric.count = results.length;
  }
}

function LocalTeamPreview({ example = false }: { example?: boolean }) {
  const [snapshot, setSnapshot] = useState<TeamSnapshot | undefined>(example ? exampleTeam : undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (example || !import.meta.env.DEV) return;
    const request = new AbortController();
    void fetch("/__coach-view/local-snapshot", { signal: request.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Snapshot unavailable");
        setSnapshot(await response.json());
      })
      .catch(() => {
        if (!request.signal.aborted) setFailed(true);
      });
    return () => request.abort();
  }, [example]);

  return (
    <div className="pt-pose portal-body pt-insights is-coach-workspace cv-page">
      <header className="portal-header">
        <Link className="portal-brand" to="/" aria-label="PoseTek home"><span className="portal-brand-mark">P</span>POSETEK</Link>
        <span className="insights-note cv-demo">{example ? "Coach example · fictional data" : "Private local preview"}</span>
      </header>
      <main className="insights-shell">
        <section className="insights-heading">
          <p className="eyebrow">Coach View</p>
          <h1>{snapshot?.team ?? "Local team snapshot"}</h1>
          {snapshot && <p>{snapshot.club} · {snapshot.athletes.length} athletes · Snapshot {snapshot.asOf}</p>}
        </section>
        {snapshot ? <SnapshotResults snapshot={snapshot} /> :
          <p role="status">{failed ? "The local team snapshot is unavailable." : "Loading team snapshot…"}</p>}
      </main>
    </div>
  );
}

function SnapshotResults({ snapshot: { athletes } }: { snapshot: TeamSnapshot }) {
  return (
    <>
      <CoachStandings athletes={athletes} />
      <CoachRoster athletes={athletes} />
      <CoachFollowUp items={athletes.map(a => athleteCheckIn(
        a.name,
        a.activeDays7d === 0 && a.workouts7d === 0
          ? "No app activity or completed workout recorded in the seven-day window."
          : `${a.activeDays7d} app days · ${a.workouts7d} completed workouts in the seven-day window.`,
      ))} />
    </>
  );
}

export default function CoachViewPage() {
  const [params] = useSearchParams();
  useEffect(() => { document.title = "Coach View | PoseTek"; }, []);
  if (params.get("example") === "1") return <LocalTeamPreview key="example" example />;
  return import.meta.env.DEV && params.get("snapshot") === "local" ? <LocalTeamPreview /> : <DemoCoachView />;
}

function DemoCoachView() {
  const navigate = useNavigate();
  // Same shell as the signed-in coach workspace (InsightsPage): portal header,
  // insights-shell main column and insights cards. The brand returns to the public homepage.
  return (
    <div className="pt-pose portal-body pt-insights is-coach-workspace cv-page">
      <header className="portal-header">
        <Link className="portal-brand" to="/" aria-label="PoseTek home"><span className="portal-brand-mark">P</span>POSETEK</Link>
        <span className="insights-note cv-demo">Prototype · demo data</span>
        <button className="quiet-button" onClick={() => { void auth.signOut().finally(() => navigate("/")); }}>Sign out</button>
      </header>
      <main className="insights-shell">
        <section className="insights-heading">
          <p className="eyebrow">Coach View</p>
          <h1>Varsity squad</h1>
          <p>Last 14 days · {ATHLETES.length} athletes</p>
        </section>
        <section className="insights-card">
          <div className="card-heading"><div><h2>Performance by athlete</h2><p>Top 3 in green, bottom 3 in red</p></div></div>
          <PerformanceChart />
        </section>
        <div className="cv-split">
          <AthleteTable title="Top 3" tone="top" athletes={TOP} />
          <AthleteTable title="Bottom 3" tone="bottom" athletes={BOTTOM} />
        </div>
        <CoachFollowUp items={demoAttention} />
      </main>
    </div>
  );
}
