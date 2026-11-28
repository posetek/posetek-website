import { useId } from "react";
import { coachActivityWindow, getTeamActivity, type SamplePlayer, type SampleTeam } from "./coach-samples";

export function CoachWorkoutTime({ team, player }: { team: SampleTeam; player: SamplePlayer }) {
  const titleId = useId();
  const roster = [...team.players, ...team.otherDribbleResults].sort((a, b) => b.workoutMinutes - a.workoutMinutes);
  const mostMinutes = roster[0]?.workoutMinutes ?? 0;
  const { workoutMinutes } = getTeamActivity(team);

  return (
    <section className="coach-workout-time" aria-labelledby={titleId}>
      <div className="coach-time-context"><span>{team.name} coach dashboard</span><span>{coachActivityWindow}</span></div>
      <h3 id={titleId}>Logged workout time</h3>
      <div className="coach-time-total"><strong>{workoutMinutes}<span> min</span></strong><span>Team total</span></div>
      <table aria-label="Workout minutes by player">
        <thead><tr><th scope="col">Player</th><th scope="col">Recorded time</th></tr></thead>
        <tbody>{roster.map(member => (
          <tr key={member.name} aria-current={member === player ? "true" : undefined} data-selected={member === player}>
            <th scope="row">{member.name}</th>
            <td>
              <span className="coach-time-track" aria-hidden="true"><i style={{ width: `${mostMinutes ? member.workoutMinutes / mostMinutes * 100 : 0}%` }} /></span>
              <span>{member.workoutMinutes} min</span>
            </td>
          </tr>
        ))}</tbody>
      </table>
      <p>Time players logged in PoseTek workouts.</p>
    </section>
  );
}
