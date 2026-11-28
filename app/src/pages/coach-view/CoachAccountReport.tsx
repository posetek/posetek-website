import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { clubCall } from "../../lib/organization-data";
import { CoachInput } from "./share/CoachInput";
import { focusRoster, TeamResults } from "./share/TeamResults";
import type { CoachNote } from "./share/coachNotes";
import type { SharedTeam } from "./share/reportData";
import { CoachParentReminders } from "./CoachParentReminders";
import "../../styles/pose-portal.css";
import "../insights/insights.scss";
import "./coach-view.scss";
import "./share/team-report.css";
import "./coach-account-report.css";

type TeamChoice = { id: string; name: string; organizationId: string; club: string };
type SavedNote = Omit<CoachNote, "player"> & { playerId: string };
type AccountTeam = Omit<SharedTeam, "athletes"> & {
  athletes: (SharedTeam["athletes"][number] & { id: string })[];
};
type ReportResponse = { report: AccountTeam; notes: SavedNote[]; hasApprovedSnapshot: boolean };
type NoteDraft = Pick<CoachNote, "category" | "detail" | "player">;

function indexNotes(notes: SavedNote[], roster: { id: string }[]): CoachNote[] {
  const indices = new Map(roster.map((a, index) => [a.id, index]));
  return notes.flatMap(({ playerId, ...note }) => {
    const player = indices.get(playerId);
    return player === undefined ? [] : [{ ...note, player }];
  });
}

function TeamPage({
  scope,
  choices,
  choose,
  uid,
}: {
  scope: TeamChoice;
  choices: TeamChoice[];
  choose: (team: TeamChoice) => void;
  uid: string;
}) {
  const { organizationId, id: teamId } = scope;
  const [result, setResult] = useState<ReportResponse>();
  const [error, setError] = useState("");
  const [inputOpen, setInputOpen] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<Omit<SavedNote, "createdAt"> | null>(null);
  const generation = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const invalidate = useCallback(() => ++generation.current, []);
  const refresh = useCallback(() => {
    ++generation.current;
    setResult(undefined);
    setError("");
    setAttempt((a) => a + 1);
  }, []);
  useEffect(() => {
    const id = ++generation.current;
    let open = true;
    const current = () => open && id === generation.current && auth.currentUser?.uid === uid;
    clubCall<ReportResponse>("getCoachTeamReport", { organizationId, teamId })
      .then((value) => {
        if (current()) setResult(value);
      })
      .catch(() => {
        if (current()) setError("Couldn’t open this team. Refresh to check your current access.");
      });
    return () => {
      open = false;
    };
  }, [attempt, organizationId, teamId, uid]);
  useEffect(() => {
    const member = db.collection("organizations").doc(organizationId).collection("members").doc(uid);
    const deny = () => {
      ++generation.current;
      setResult(undefined);
      setError("This team is unavailable to your coach account.");
    };
    const unsubscribe = member.onSnapshot((snap) => {
      if (snap.metadata.fromCache) return;
      const data = snap.data();
      if (
        data?.userUID !== uid ||
        data?.status !== "active" ||
        data?.role !== "coach" ||
        !Array.isArray(data.teamIds) ||
        !data.teamIds.includes(teamId)
      )
        deny();
    }, deny);
    function visible() {
      if (document.visibilityState === "visible") refresh();
    }
    function restored(event: PageTransitionEvent) {
      if (event.persisted) refresh();
    }
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pageshow", restored);
    return () => {
      invalidate();
      unsubscribe();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pageshow", restored);
    };
  }, [organizationId, teamId, uid, refresh, invalidate]);

  async function saveNote(input: NoteDraft) {
    const playerId = result?.report.athletes[input.player]?.id;
    if (!playerId || auth.currentUser?.uid !== uid) throw new Error("Team access changed.");
    let command = pending.current;
    if (
      !command ||
      command.playerId !== playerId ||
      command.category !== input.category ||
      command.detail !== input.detail
    ) {
      command = { id: crypto.randomUUID(), playerId, category: input.category, detail: input.detail };
      pending.current = command;
    }
    const session = generation.current;
    const saved = await clubCall<SavedNote>("saveCoachTeamNote", { organizationId, teamId, ...command });
    if (session !== generation.current || auth.currentUser?.uid !== uid)
      throw new Error("Team access changed.");
    setResult(
      (current) =>
        current && { ...current, notes: [saved, ...current.notes.filter((n) => n.id !== saved.id)] },
    );
    pending.current = null;
  }
  const teamNames = choices.map((c) =>
    choices.some((t) => t.id !== c.id && t.name === c.name) ? c.club + " · " + c.name : c.name,
  );
  const teamSelect = choices.length > 1 && (
    <label className="ca-team-select">
      Team
      <select
        value={teamId}
        onChange={(e) => {
          const next = choices.find((t) => t.id === e.target.value);
          if (next) choose(next);
        }}
      >
        {choices.map((t, i) => (
          <option key={t.id} value={t.id}>
            {teamNames[i]}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <header className="portal-header">
        <div className="cv-header-inner">
          <Link className="portal-brand" to="/insights">
            <span className="portal-brand-mark">P</span> POSETEK
          </Link>
          <div className="cv-header-actions">
            {teamSelect}
            {result?.hasApprovedSnapshot && (
              <button
                className="cv-input-trigger"
                ref={trigger}
                onClick={() => setInputOpen(true)}
                aria-haspopup="dialog"
              >
                Coaches Input
              </button>
            )}
          </div>
        </div>
      </header>
      {error ? (
        <main className="ca-state">
          <h1>Coach report</h1>
          <p role="alert">{error}</p>
          <button onClick={refresh}>Refresh</button> <Link to="/coach-report">My teams</Link>
        </main>
      ) : !result ? (
        <main className="ca-state" role="status">
          Loading team report…
        </main>
      ) : (
        <>
          {!result.hasApprovedSnapshot && (
            <p className="ca-notice">The roster and report for {scope.name} are awaiting publication.</p>
          )}
          {result.hasApprovedSnapshot && (
            <TeamResults
              teams={[result.report]}
              active={0}
              onSelectTeam={() => {}}
              record={() => {}}
              renderReminder={() => (
                <CoachParentReminders
                  organizationId={organizationId}
                  teamId={teamId}
                  athletes={result.report.athletes.map(({ id, name }) => ({ id, name }))}
                />
              )}
            />
          )}
          {result.hasApprovedSnapshot && inputOpen && (
            <CoachInput
              authenticated
              teamName={scope.name}
              teams={teamNames}
              teamIndex={choices.findIndex((t) => t.id === teamId)}
              onSelectTeam={(i) => choose(choices[i])}
              players={result.report.athletes.map((a) => a.name)}
              notes={indexNotes(result.notes, result.report.athletes)}
              saveNote={saveNote}
              onClose={() => {
                setInputOpen(false);
                requestAnimationFrame(() => focusRoster(0));
              }}
            />
          )}
          <footer className="ca-footer">
            <Link to={`/insights?${new URLSearchParams({ orgId: organizationId, teamId })}`}>
              Team Insights
            </Link>
            <button
              onClick={() => {
                void auth.signOut().catch(() => setError("Sign-out failed. Try again."));
              }}
            >
              Sign out
            </button>
          </footer>
        </>
      )}
    </>
  );
}

function AssignedTeams({
  uid,
  orgId,
  teamId,
  choose,
}: {
  uid: string;
  orgId: string;
  teamId: string;
  choose: (team: TeamChoice) => void;
}) {
  const [choices, setChoices] = useState<TeamChoice[]>();
  const [error, setError] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    clubCall<{ teams: TeamChoice[] }>("getCoachReportTeams", orgId ? { organizationId: orgId } : {})
      .then((r) => {
        if (active && auth.currentUser?.uid === uid) setChoices(r.teams);
      })
      .catch(() => {
        if (active && auth.currentUser?.uid === uid) setError(true);
      });
    return () => {
      active = false;
    };
  }, [orgId, uid, attempt]);
  if (error)
    return (
      <main className="ca-state">
        <h1>My teams</h1>
        <p role="alert">Couldn’t load your assigned teams.</p>
        <button
          onClick={() => {
            setError(false);
            retry((n) => n + 1);
          }}
        >
          Try again
        </button>
      </main>
    );
  if (!choices)
    return (
      <main className="ca-state" role="status">
        Checking your team access…
      </main>
    );
  const team = teamId ? choices.find((t) => t.id === teamId) : choices.length === 1 ? choices[0] : undefined;
  if (team) return <TeamPage key={team.id} uid={uid} choices={choices} scope={team} choose={choose} />;
  return (
    <main className="ca-state">
      <h1>My teams</h1>
      {teamId && <p role="status">The requested team is unavailable to this account.</p>}
      {choices.length ? (
        <>
          <p>Choose a team to open its report.</p>
          <div className="ca-teams">
            {choices.map((t) => (
              <button key={t.id} onClick={() => choose(t)}>
                <strong>{t.name}</strong>
                <span>{t.club}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p>
          No team reports are available to this account. Ask your club administrator to check your access.
        </p>
      )}
      <Link to="/insights">Team Insights</Link>
    </main>
  );
}

export default function CoachAccountReport() {
  const [uid, setUid] = useState<string | null>();
  const [params, setParams] = useSearchParams();
  const orgId = params.get("orgId") || "",
    teamId = params.get("teamId") || "";
  useEffect(() => {
    document.title = "Coach report | PoseTek";
    return auth.onAuthStateChanged((user) => setUid(user?.uid ?? null));
  }, []);
  const choose = (t: TeamChoice) => setParams({ orgId: t.organizationId, teamId: t.id });
  return (
    <div
      data-clarity-mask="true"
      className="pt-pose portal-body pt-insights is-coach-workspace cv-page cr-page ca-report"
    >
      {uid === undefined ? (
        <main className="ca-state" role="status">
          Checking account…
        </main>
      ) : uid === null ? (
        <main className="ca-state">
          <h1>Coach report</h1>
          <p>Sign in with your assigned coach account to open your teams.</p>
          <a
            className="cv-input-trigger ca-signin"
            href={`/kickai.html?${new URLSearchParams({ returnTo: "/coach-report" + (params.size ? "?" + params : "") })}`}
          >
            Sign in
          </a>
        </main>
      ) : (
        <AssignedTeams key={uid + "/" + orgId} uid={uid} orgId={orgId} teamId={teamId} choose={choose} />
      )}
    </div>
  );
}
