import { createRoot } from "react-dom/client";
import { useState } from "react";
import { CoachStandings } from "../CoachStandings";
import { CoachRoster, type RosterAthlete } from "../CoachRoster";
import "./reader.css";
import "../coach-view.scss";

type SharedAthlete = RosterAthlete & { followUp: boolean };
type SharedTeam = { team: string; club: string; asOf: string; athletes: SharedAthlete[] };

function FollowUp({ athletes }: { athletes: SharedAthlete[] }) {
  const flagged = athletes.filter(a => a.followUp);
  const [selected, setSelected] = useState<string | null>(null);
  return <section className="insights-card cv-attention">
    <div className="card-heading"><div><h2>Needs attention</h2><p>{flagged.length} of {athletes.length} roster entries had no recorded app activity or completed workout in the seven days ending on the snapshot date.</p></div></div>
    {flagged.length > 0 && <div className="cv-recipients" role="group" aria-label="Follow-up by athlete">{flagged.map(a =>
      <button key={a.name} aria-pressed={a.name === selected} onClick={() => setSelected(selected === a.name ? null : a.name)}>{a.name}</button>)}</div>}
    {selected && <div className="cv-who"><div><strong>{selected}</strong><p>Suggested check-in</p><p>Hi {selected.split(' ')[0]}, how has practice been going since our last session? Let me know if you need help finding your next workout.</p></div></div>}
  </section>;
}
function TeamView({ team }: { team: SharedTeam }) {
  return <div className="pt-pose portal-body pt-insights is-coach-workspace cv-page">
    <header className="portal-header"><strong className="portal-brand"><span className="portal-brand-mark">P</span> POSETEK</strong><span>View only</span></header>
    <main className="insights-shell">
      <section className="insights-heading"><p className="eyebrow">Coach View</p><h1>{team.team}</h1><p>{team.club} · {team.athletes.length} roster entries · Snapshot {team.asOf}</p></section>
      <CoachStandings athletes={team.athletes}/><CoachRoster athletes={team.athletes}/><FollowUp athletes={team.athletes}/>
    </main></div>;
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
