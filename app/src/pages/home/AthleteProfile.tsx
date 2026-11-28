import { useMemo, useState } from "react";
import ClubCloudChart from "../athlete-portal/player/stats/ClubCloudChart";
import "../athlete-portal/player/stats/club-comparison.css";
import { DEFAULT_PATHWAY_ID, pathwayTestIds, samplePathways, samplePathwayStats, type PathwayTestId } from "./development-pathway-sample";
import { sampleAthlete } from "./product/product-demo";
import "./athlete-profile-sample.css";

export function AthleteProfile({ onOpenWorkout }: { onOpenWorkout: () => void }) {
  const [selectedTest, setSelectedTest] = useState<PathwayTestId>(DEFAULT_PATHWAY_ID);
  const test = samplePathways[selectedTest];
  const stats = useMemo(() => samplePathwayStats(selectedTest), [selectedTest]);
  const ageGroup = stats.groups.find(group => group.ageGroup === stats.own?.ageGroup);

  return (
    <div className="profile-demo reveal" aria-label="Fictional PoseTek player profile">
      <div className="demo-window">
        <div className="demo-topbar">
          <span className="mini-mark">P</span>Player Stats<span className="live-chip">Fictional example</span>
        </div>
        <div className="demo-content">
          <div className="athlete-row">
            <span className="avatar">{sampleAthlete.initials}</span>
            <span><strong>{sampleAthlete.name}</strong><small>{sampleAthlete.role} · Parkside FC U17</small></span>
          </div>

          <section className="profile-pathway" aria-labelledby="sample-pathway-title">
            <h4 id="sample-pathway-title">Development pathway</h4>
            <div className="profile-pathway-tests" role="group" aria-label="Choose a test">
              {pathwayTestIds.map(id => (
                <button key={id} type="button" data-pathway-test={id} aria-pressed={selectedTest === id}
                  onClick={() => setSelectedTest(id)}>{samplePathways[id].label}</button>
              ))}
            </div>
            <div className="profile-pathway-display">
              {stats.own && ageGroup && (
                <div className="profile-pathway-score">
                  <span className="card-kicker">{test.measure}</span>
                  <dl className="profile-pathway-numbers" aria-label={`${test.label} comparison`} aria-live="polite" aria-atomic="true">
                    <div>
                      <dt><i className="profile-key-player" aria-hidden="true" />Alex’s best</dt>
                      <dd>{stats.own.best.toFixed(test.digits)} <small>{test.unit}</small></dd>
                    </div>
                    <div>
                      <dt><i className="profile-key-club" aria-hidden="true" />U{ageGroup.ageGroup} club average</dt>
                      <dd>{ageGroup.mean.toFixed(test.digits)} <small>{test.unit}</small></dd>
                    </div>
                  </dl>
                </div>
              )}
              <div className="pt-player profile-pathway-chart">
                <ClubCloudChart key={selectedTest} title={`${test.label} · ${test.measure}`} stats={stats} digits={test.digits}
                  context={["Parkside FC", `${stats.athletes} sample players`]} />
              </div>
            </div>
            <p className="profile-pathway-guide">The line follows the club average. Shading shows how results vary by age. Tap a group or use the arrow keys to explore.</p>
          </section>

          <section className="profile-assessment" aria-label="Team comparison and next workout">
            <div aria-live="polite">
              <span className="card-kicker">Same team · Same testing day</span>
              <h4>{test.label}</h4>
              <dl>
                <div><dt>Alex’s result</dt><dd>{test.testDayResult}</dd></div>
                <div><dt>Team average</dt><dd>{test.testDayTeamAverage}</dd></div>
              </dl>
              {test.unit === "m/s" && <p>The team records a time for the 20 m course. The chart above shows speed over that same distance.</p>}
              {selectedTest === "sprint" && <p>The team records a sprint time. The chart above shows how fast players were moving at the 5 m mark.</p>}
            </div>
            <div>
              <span className="card-kicker">Alex’s training focus</span>
              <h4>Keep the ball close through turns.</h4>
              <p>Across four tests, Alex’s left dribble went from 6.62 to 6.18 seconds. Alex’s next workout starts with the Figure-8 dribble to practice short touches around two cones.</p>
              <button type="button" className="profile-workout-action" onClick={onOpenWorkout}>Try Alex’s dribbling workout <span aria-hidden="true">→</span></button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
