import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import { athleteCheckIn, CoachFollowUp } from "../CoachFollowUp";
import { CoachStandings } from "../CoachStandings";
import { CoachRoster } from "../CoachRoster";
import { TeamResults, focusRoster } from "./TeamResults";
import { rosterName, type SharedTeam } from "./reportData";
import { clickedAction, createUsage, usageEnabled } from "./usage";
import { CoachInput } from "./CoachInput";
import { coachNotesEnabled, createCoachNotes, localCoachNotes, type CoachNote } from "./coachNotes";
import "./reader.css";
import "../coach-view.scss";
import "./team-report.css";


function focusFollowUp(idSuffix: string) {
  const heading = document.getElementById(`team-follow-up${idSuffix}`);
  heading?.scrollIntoView({ block: "start" });
  heading?.focus({ preventScroll: true });
}

function TeamPanel({ team, suffix }: { team: SharedTeam; suffix: string }) {
  const [teamLabel, coachLabel] = team.team.split(" — ");
  const reportCount = team.athletes.filter(athlete => athlete.report).length;
  const recipients = team.athletes.map(athlete => athleteCheckIn(
    athlete.name,
    athlete.followUp
      ? "No app activity or completed workout recorded in the seven-day window."
      : "Team check-in",
  ));

  return <>
      <section className="insights-heading cv-team-heading">
        <div><p className="eyebrow">{team.club}</p><h1>{teamLabel}</h1>
          <p className="cv-team-byline">{coachLabel && <span>{coachLabel}</span>}<span>Snapshot {team.asOf}</span></p>
        </div>
        <dl className="cv-report-totals">
          <div><dt>Players</dt><dd>{team.athletes.length}</dd></div>
          <div><dt>One-pagers</dt><dd>{reportCount}</dd></div>
        </dl>
      </section>
      <CoachStandings athletes={team.athletes}/>
      <div className="cv-report-details">
        <CoachRoster athletes={team.athletes} groupName={`coach-roster${suffix}`}/>
        <CoachFollowUp items={recipients} idSuffix={suffix} heading="Athlete follow-up"/>
      </div>
  </>;
}

type NotesClient = Awaited<ReturnType<typeof createCoachNotes>>;

function TeamInput({ team, teamIndex, teams, onSelectTeam, client, onClose }: {
  team: SharedTeam; teamIndex: number; teams: string[]; onSelectTeam: (index: number) => void; client: NotesClient; onClose: () => void;
}) {
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const pending = useRef<CoachNote | null>(null);
  useEffect(() => {
    let active = true;
    client.list(teamIndex).then(saved => {
      if (active) setNotes(saved.filter(note => note.player >= 0 && note.player < team.athletes.length));
    }).catch(() => {
      if (active) setLoadError(localCoachNotes ? "This browser couldn’t open your offline notes. Allow local storage or use the live preview." : "Couldn’t load saved input. Close and reopen Coaches input to try again.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, teamIndex, team]);

  async function saveNote(input: Pick<CoachNote, "player" | "category" | "detail">) {
    let note = pending.current;
    if (!note || note.player !== input.player || note.category !== input.category || note.detail !== input.detail) {
      note = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      pending.current = note;
    }
    await client.save(teamIndex, note);
    const saved = note;
    setNotes(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
    pending.current = null;
  }
  return <CoachInput teamName={rosterName(team)} teams={teams} teamIndex={teamIndex} onSelectTeam={onSelectTeam} players={team.athletes.map(athlete => athlete.name)}
    notes={notes} loading={loading} loadError={loadError} saveNote={saveNote} onClose={onClose}/>;
}

function TeamView({ teams, record, client, resultsLayout }: { teams: SharedTeam[]; resultsLayout: boolean; client: NotesClient | null; record: Awaited<ReturnType<typeof createUsage>> }) {
  const [active, setActive] = useState(0);
  const [inputOpen, setInputOpen] = useState(Boolean(client));
  const trigger = useRef<HTMLButtonElement>(null);
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
  return <div className={`pt-pose portal-body pt-insights is-coach-workspace cv-page${resultsLayout ? " cr-page" : ""}`}
    onClickCapture={e => {
      if (!(e.target instanceof Element)) return;
      const action = clickedAction(e.target);
      if (action) record(action, active);
    }}
    onChangeCapture={e => {
      if (e.target instanceof HTMLSelectElement && e.target.closest(".cv-test-select")) {
        const roster = e.target.closest<HTMLElement>("[data-results-team]");
        record("standings-test", roster ? Number(roster.dataset.resultsTeam) : active);
      }
    }}>
    <header className="portal-header">
      <div className="cv-header-inner">
        <strong className="portal-brand"><span aria-hidden="true" className="portal-brand-mark">P</span> POSETEK</strong>
        <div className="cv-header-actions">
          {!resultsLayout && <button className="cv-group cv-message-jump" aria-label="Message athletes" onClick={() => focusFollowUp(suffix(active))}>
            <span className="cv-label-wide">Message athletes</span><span className="cv-label-small">Messages</span>
          </button>}
          {client && <button className="cv-input-trigger" ref={trigger} aria-haspopup="dialog"
            onClick={() => setInputOpen(true)}>Coaches Input</button>}
        </div>
      </div>
    </header>
    {resultsLayout ? <TeamResults teams={teams} active={active} onSelectTeam={selectTeam} record={record}/> :
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
    </main>}
    {client && inputOpen && <TeamInput key={active} team={teams[active]} teamIndex={active} teams={teams.map(rosterName)} onSelectTeam={selectTeam} client={client}
      onClose={() => {
        setInputOpen(false);
        requestAnimationFrame(() => {
          if (resultsLayout) focusRoster(active);
          else trigger.current?.focus({ preventScroll: true });
        });
      }}/>}
  </div>;
}

async function openView() {
  const embedded: { key: string; snapshot: string } | null = localCoachNotes
    ? JSON.parse(document.getElementById("offline-report")?.textContent || "null") : null;
  if (localCoachNotes && !embedded) throw new Error("Open the offline review file");
  const keyText = embedded?.key ?? location.hash.slice(1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(keyText)) throw new Error("Invalid link");
  const keyBytes = Uint8Array.from(atob(keyText.replace(/-/g, '+').replace(/_/g, '/') + '='), ch => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  let ciphertext: Uint8Array<ArrayBuffer>;
  if (embedded) {
    ciphertext = Uint8Array.from(atob(embedded.snapshot), ch => ch.charCodeAt(0));
  } else {
    const response = await fetch("./view.bin", {credentials:"omit", cache:"no-store", redirect:"error"});
    if (!response.ok) throw new Error("Data unavailable");
    ciphertext = new Uint8Array(await response.arrayBuffer());
  }
  const plain = await crypto.subtle.decrypt({name:"AES-GCM", iv:ciphertext.subarray(0,12)}, key, ciphertext.subarray(12));
  const data: SharedTeam | { layout?: string; teams: SharedTeam[] } = JSON.parse(new TextDecoder().decode(plain));
  const client = coachNotesEnabled ? await createCoachNotes(keyText) : null;
  const record = await createUsage(keyText).catch(() => () => {});
  const recordOpen = () => {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", recordOpen);
    record("open", 0);
  };
  document.addEventListener("visibilitychange", recordOpen);
  recordOpen();
  const teams = "teams" in data ? data.teams : [data];
  if (!teams.length) throw new Error("Report unavailable");
  const resultsLayout = data.layout === "roster-results" || (Boolean(client) && teams.length === 1);
  createRoot(document.getElementById("root")!).render(<TeamView client={client} record={record} teams={teams} resultsLayout={resultsLayout}/>);
}
openView().catch(() => {
  document.getElementById("status")!.textContent = "Open the complete private link shared with you to view your team.";
});
