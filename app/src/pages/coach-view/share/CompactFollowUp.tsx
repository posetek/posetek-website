import { workoutMinutes } from "../../../lib/workout-duration";
import { athleteCheckIn, CoachFollowUp } from "../CoachFollowUp";
import { rosterName, type SharedTeam } from "./reportData";
import "./compact-follow-up.css";

export function Milestone({ value }: { value?: boolean | null }) {
  if (value == null) return <span className="cr-status">Unconfirmed</span>;
  return <span className={value ? "cr-status is-done" : "cr-status"}>{value ? "Yes" : "Not yet"}</span>;
}

function timerText(activity: SharedTeam["athletes"][number]["activity"]) {
  const { timerRecords, timerMinutes } = activity ?? {};
  if (timerRecords == null) return "Unconfirmed";
  if (timerRecords === 0) return "No timer recorded";
  if (timerMinutes == null) return "Unconfirmed";
  if (timerMinutes > 0 && timerMinutes < 0.1) return "<0.1 min";
  return workoutMinutes(timerMinutes);
}

export function CompactFollowUp({ team, index }: { team: SharedTeam; index: number }) {
  const name = rosterName(team);
  return <section className="cr-team-activity" aria-label={`${name} activity`}>
    <div className="cr-activity-heading">
      <h3>{name}</h3>
      <span>All time · As of {team.asOf}</span>
    </div>
    {team.athletes.length ? <>
      <div className="cr-activity-scroll" role="region" aria-label={`${name} follow-up roster`} tabIndex={0}>
        <table className="cr-activity-table" aria-label={`${name} athlete activity`}>
          <thead><tr>
            <th scope="col">Player</th>
            <th scope="col">Signed in</th>
            <th scope="col">Workout timer</th>
          </tr></thead>
          <tbody>{team.athletes.map((athlete, i) =>
            <tr className="cr-activity-row" key={i}>
              <th scope="row">{athlete.name}</th>
              <td><Milestone value={athlete.activity?.signedIn}/></td>
              <td>{timerText(athlete.activity)}</td>
            </tr>
          )}</tbody>
        </table>
      </div>
      <details className="cr-message-demo" open>
        <summary>Try a team message <span className="cr-chevron" aria-hidden="true">›</span></summary>
        <CoachFollowUp items={team.athletes.map(athlete => athleteCheckIn(athlete.name, "Team check-in"))}
          heading="Message athletes" idSuffix={`-review-${index}`}/>
      </details>
    </> : <p className="cr-no-results">No players on this roster.</p>}
  </section>;
}
