import { createRoot } from "react-dom/client";
import { athleteCheckIn, CoachFollowUp } from "../CoachFollowUp";
import { CoachStandings } from "../CoachStandings";
import { CoachRoster, type RosterAthlete } from "../CoachRoster";
import "./reader.css";
import "../coach-view.scss";

type SharedAthlete = RosterAthlete & { followUp: boolean };
type SharedTeam = { team: string; club: string; asOf: string; athletes: SharedAthlete[] };

function focusFollowUp() {
  const heading = document.getElementById("team-follow-up");
  heading?.scrollIntoView({ block: "start" });
  heading?.focus({ preventScroll: true });
}

function TeamView({ team }: { team: SharedTeam }) {
  const recipients = team.athletes.map(athlete => athleteCheckIn(
    athlete.name,
    athlete.followUp
      ? "No app activity or completed workout recorded in the seven-day window."
      : "Team check-in",
  ));

  return <div className="pt-pose portal-body pt-insights is-coach-workspace cv-page">
    <header className="portal-header">
      <strong className="portal-brand"><span className="portal-brand-mark">P</span> POSETEK</strong>
      <button className="cv-group" onClick={focusFollowUp}>Message athletes</button>
    </header>
    <main className="insights-shell">
      <section className="insights-heading"><p className="eyebrow">Coach View · Demo</p><h1>{team.team}</h1><p>{team.club} · {team.athletes.length} roster entries · Snapshot {team.asOf}</p></section>
      <CoachStandings athletes={team.athletes}/>
      <CoachRoster athletes={team.athletes}/>
      <CoachFollowUp items={recipients}/>
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
  const team = JSON.parse(new TextDecoder().decode(plain));
  createRoot(document.getElementById("root")!).render(<TeamView team={team}/>);
}
openView().catch(() => {
  document.getElementById("status")!.textContent = "Open the complete private link shared with you to view your team.";
});
