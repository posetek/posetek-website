// Coach View prototype: one condensed page per team for coaches.
// Dummy data only (coachViewData.ts); Send is not wired to any messaging yet.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../../lib/firebase";
import Chart from "chart.js/auto";
import { CHART_AXIS, CHART_THEME } from "../insights/chartTheme";
import { ATHLETES, BOTTOM, NEEDS_ATTENTION, TOP, byId, hours, type Athlete } from "./coachViewData";
import "../../styles/pose-portal.css";
import "../../styles/admin-theme.scss";
import "../insights/insights.scss";
import "./coach-view.scss";

const topIds = new Set(TOP.map(a => a.id)), bottomIds = new Set(BOTTOM.map(a => a.id));

function PerformanceChart() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const color = (a: Athlete) => topIds.has(a.id) ? CHART_THEME.accent : bottomIds.has(a.id) ? CHART_THEME.danger : CHART_THEME.neutral;
    const chart = new Chart(canvas.current, {
      type: "line",
      data: {
        labels: ATHLETES.map(a => a.name.split(" ")[0]),
        datasets: [{
          data: ATHLETES.map(a => a.performance),
          showLine: false,
          pointRadius: 6, pointHoverRadius: 8,
          pointBackgroundColor: ATHLETES.map(color),
          pointBorderColor: CHART_THEME.surface, pointBorderWidth: 2,
        }],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => ATHLETES[items[0].dataIndex].name, label: item => `Performance ${item.parsed.y}` } } },
        scales: {
          x: { ...CHART_AXIS, grid: { display: false }, ticks: { ...CHART_AXIS.ticks, autoSkip: false, maxRotation: 60 } },
          y: { ...CHART_AXIS, min: 0, max: 100, title: { display: true, text: "Performance", color: CHART_THEME.text } },
        },
      },
    });
    return () => chart.destroy();
  }, []);
  return <div className="cv-chart"><canvas ref={canvas} aria-label="Performance by athlete" role="img" /></div>;
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

function NeedsAttention() {
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState(() => NEEDS_ATTENTION.map(item => item.message));
  const [sent, setSent] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState(false);
  const total = NEEDS_ATTENTION.length, item = NEEDS_ATTENTION[index], athlete = byId(item.athleteId);
  const allSent = sent.size === total;

  function send() {
    // TODO: wire to messaging. For now this only records the send locally.
    const next = new Set(sent).add(index);
    setSent(next);
    setToast(true);
    window.setTimeout(() => setToast(false), 1000);
    window.setTimeout(() => {
      const following = Array.from({ length: total }, (_, k) => (index + 1 + k) % total).find(k => !next.has(k));
      if (following !== undefined) setIndex(following);
    }, 1300);
  }

  return (
    <section className="insights-card cv-attention">
      <div className="card-heading">
        <div><h2>Needs attention</h2><p>{total - sent.size} of {total} texts ready to send</p></div>
        <div className="cv-nav">
          <button className="icon-button" aria-label="Previous athlete" onClick={() => setIndex((index - 1 + total) % total)}><span className="material-symbols-outlined">chevron_left</span></button>
          <span>{index + 1} / {total}</span>
          <button className="icon-button" aria-label="Next athlete" onClick={() => setIndex((index + 1) % total)}><span className="material-symbols-outlined">chevron_right</span></button>
        </div>
      </div>
      {allSent ? <p className="cv-done">All caught up. Every text is sent.</p> : (
        <div className="cv-message" key={index}>
          <div className="cv-who">
            <div className="player-avatar">{athlete.name.split(" ").map(p => p[0]).join("")}</div>
            <div><strong>{athlete.name}</strong><span className="cv-reason">{item.reason}</span></div>
          </div>
          <label className="cv-to" htmlFor={`cv-draft-${index}`}>To: {item.recipient}</label>
          <textarea id={`cv-draft-${index}`} value={drafts[index]} disabled={sent.has(index)}
            onChange={e => setDrafts(d => d.map((m, k) => k === index ? e.target.value : m))} />
          {sent.has(index)
            ? <span className="status-chip active">Sent</span>
            : <button className="primary-cta cv-send" onClick={send}><span className="material-symbols-outlined">send</span>Send</button>}
        </div>
      )}
      <div className={`cv-toast${toast ? " show" : ""}`} role="status" aria-live="polite">{toast ? "Text sent" : ""}</div>
    </section>
  );
}

export default function CoachViewPage() {
  const navigate = useNavigate();
  useEffect(() => { document.title = "Coach View | PoseTek"; }, []);
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
        <NeedsAttention />
      </main>
    </div>
  );
}
