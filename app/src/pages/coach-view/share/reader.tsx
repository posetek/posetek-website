import { useState, type KeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import { athleteCheckIn, CoachFollowUp } from "../CoachFollowUp";
import { CoachStandings } from "../CoachStandings";
import { CoachRoster, type RosterAthlete } from "../CoachRoster";
import { clickedAction, createUsage, usageEnabled } from "./usage";
import "./reader.css";
import "../coach-view.scss";

type SharedAthlete = RosterAthlete & { followUp: boolean };
type SharedTeam = { team: string; club: string; asOf: string; athletes: SharedAthlete[] };

function focusFollowUp(idSuffix: string) {
  const heading = document.getElementById(`team-follow-up${idSuffix}`);
  heading?.scrollIntoView({ block: "start" });
  heading?.focus({ preventScroll: true });
}

function TeamPanel({ team, suffix }: { team: SharedTeam; suffix: string }) {
  const recipients = team.athletes.map(athlete => athleteCheckIn(
    athlete.name,
    athlete.followUp
      ? "No app activity or completed workout recorded in the seven-day window."
      : "Team check-in",
  ));

  return <>
      <section className="insights-heading"><p className="eyebrow">Coach View · Demo</p><h1>{team.team}</h1><p>{team.club} · {team.athletes.length} roster entries · Snapshot {team.asOf}</p></section>
      <CoachStandings athletes={team.athletes}/>
      <CoachRoster athletes={team.athletes} groupName={`coach-roster${suffix}`}/>
      <CoachFollowUp items={recipients} idSuffix={suffix}/>
  </>;
}

function TeamView({ teams, record }: { teams: SharedTeam[]; record: Awaited<ReturnType<typeof createUsage>> }) {
  const [active, setActive] = useState(0);
  const multiple = teams.length > 1;
  const suffix = (index: number) => multiple ? `-${index}` : "";
  function selectTeam(i: number) {
    if (i !== active) record("team", i);
    setActive(i);
  }
  function navigate(event: KeyboardEvent, index: number) {
    const next = { ArrowRight: (index + 1) % teams.length, ArrowLeft: (index + teams.length - 1) % teams.length,
      Home: 0, End: teams.length - 1 }[event.key];
    if (next == null) return;
    event.preventDefault();
    selectTeam(next);
    document.getElementById(`team-tab-${next}`)?.focus();
  }
  return <div className="pt-pose portal-body pt-insights is-coach-workspace cv-page"
    onClickCapture={e => {
      if (!(e.target instanceof Element)) return;
      const action = clickedAction(e.target);
      if (action) record(action, active);
    }}
    onChangeCapture={e => {
      if (e.target instanceof HTMLSelectElement && e.target.closest(".cv-test-select")) record("standings-test", active);
    }}>
    <header className="portal-header">
      <strong className="portal-brand"><span className="portal-brand-mark">P</span> POSETEK</strong>
      <button className="cv-group" onClick={() => focusFollowUp(suffix(active))}>Message athletes</button>
    </header>
    <main className="insights-shell">
      {usageEnabled && <p className="cv-usage-note">PoseTek records demo opens and which controls are used. Player details and message text stay private.</p>}
      {multiple && <div role="tablist" aria-label="Your teams" className="cv-team-tabs">
        {teams.map((team,i) => <button key={team.team} role="tab" id={`team-tab-${i}`}
          aria-controls={`team-panel-${i}`} aria-selected={i === active} tabIndex={i === active ? 0 : -1}
          onKeyDown={event => navigate(event,i)} onClick={() => selectTeam(i)}>{team.team.split(" — ")[0]}</button>)}
      </div>}
      {teams.map((team,i) => <div key={team.team} role={multiple ? "tabpanel" : undefined}
        id={`team-panel-${i}`} aria-labelledby={multiple ? `team-tab-${i}` : undefined} hidden={active !== i}>
        <TeamPanel team={team} suffix={suffix(i)}/>
      </div>)}
    </main>
  </div>;
}

async function openView() {
  const keyText = location.hash.slice(1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(keyText)) throw new Error("Invalid link");
  const keyBytes = Uint8Array.from(atob(keyText.replace(/-/g, '+').replace(/_/g, '/') + '='), ch => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const response = await fetch("./view.bin", {credentials:"omit", cache:"no-store", redirect:"error"});
  if (!response.ok) throw new Error("Data unavailable");
  const ciphertext = new Uint8Array(await response.arrayBuffer());
  const plain = await crypto.subtle.decrypt({name:"AES-GCM", iv:ciphertext.subarray(0,12)}, key, ciphertext.subarray(12));
  const data: SharedTeam | { teams: SharedTeam[] } = JSON.parse(new TextDecoder().decode(plain));
  const record = await createUsage(keyText).catch(() => () => {});
  const recordOpen = () => {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", recordOpen);
    record("open", 0);
  };
  document.addEventListener("visibilitychange", recordOpen);
  recordOpen();
  createRoot(document.getElementById("root")!).render(<TeamView record={record} teams={"teams" in data ? data.teams : [data]}/>);
}
openView().catch(() => {
  document.getElementById("status")!.textContent = "Open the complete private link shared with you to view your team.";
});
