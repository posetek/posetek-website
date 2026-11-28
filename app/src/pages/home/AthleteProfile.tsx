import { useState } from "react";
import { DEFAULT_SKILL, SAMPLE_DRIBBLE_RESULT, SKILL_DATA, SKILL_ORDER, progressFillBackground, progressFillWidth, skillDotShadow, type SkillKey } from "./home-logic";
import { sampleAthlete } from "./product/product-demo";
import "./athlete-profile-sample.css";

export function AthleteProfile({ onOpenWorkout }: { onOpenWorkout: () => void }) {
  const [activeSkill, setActiveSkill] = useState<SkillKey>(DEFAULT_SKILL);
  const skillKey = activeSkill;
  const skill = SKILL_DATA[skillKey];
  const skillTouched = true;
  return (
            <div className="profile-demo reveal" aria-label="Fictional PoseTek player profile">
              <div className="demo-window">
                <div className="demo-topbar"><span className="mini-mark">P</span>Player Stats<span className="live-chip">Fictional example</span></div>
                <div className="demo-content">
                  <div className="athlete-row"><span className="avatar">{sampleAthlete.initials}</span><span><strong>{sampleAthlete.name}</strong><small>{sampleAthlete.role} · Parkside FC U17</small></span><span className="sample-chip">Latest assessment</span></div>
                  <div className="demo-main">
                    <div className="radar-card">
                      <span className="card-kicker">Skill map</span>
                      <div className="radar-wrap">
                        <svg viewBox="0 0 240 240" role="img" aria-label="Interactive sample skill map">
                          <polygon className="radar-axis" points="120,25 210,91 176,197 64,197 30,91" />
                          <polygon className="radar-axis" points="120,50 186,98 161,175 79,175 54,98" />
                          <polygon className="radar-axis" points="120,76 162,106 146,153 94,153 78,106" />
                          <line className="radar-spoke" x1="120" y1="120" x2="120" y2="25" /><line className="radar-spoke" x1="120" y1="120" x2="210" y2="91" /><line className="radar-spoke" x1="120" y1="120" x2="176" y2="197" /><line className="radar-spoke" x1="120" y1="120" x2="64" y2="197" /><line className="radar-spoke" x1="120" y1="120" x2="30" y2="91" />
                          <polygon className="radar-value" points="120,43 185,99 161,176 82,172 51,98" />
                          <circle className="radar-point" cx="120" cy="43" r="4" /><circle className="radar-point" cx="185" cy="99" r="4" /><circle className="radar-point" cx="161" cy="176" r="4" /><circle className="radar-point" cx="82" cy="172" r="4" /><circle className="radar-point" cx="51" cy="98" r="4" />
                        </svg>
                        {SKILL_ORDER.map(key => {
                          const active = key === skillKey;
                          return (
                            <button
                              key={key}
                              className={`radar-label label-${key}${active ? " active" : ""}`}
                              type="button"
                              data-skill={key}
                              aria-pressed={active}
                              onClick={() => setActiveSkill(key)}
                            >
                              {SKILL_DATA[key].name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="breakdown-card" aria-live="polite">
                      <span className="card-kicker">Skill breakdown</span>
                      <div className="breakdown-head">
                        <span
                          className="skill-dot"
                          id="skillDot"
                          style={skillTouched ? { background: skill.color, boxShadow: skillDotShadow(skill.color) } : undefined}
                        />
                        <strong id="skillName">{skill.name}</strong>
                      </div>
                      <div className="score-line"><strong id="skillScore">{skill.score}</strong><span id="skillChange">{skill.change}</span></div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          id="progressFill"
                          style={skillTouched ? { width: progressFillWidth(skill.score), background: progressFillBackground(skill.color) } : undefined}
                        />
                      </div>
                      <div className="metric-list" id="metricList">
                        {skill.metrics.map(([key, value]) => (
                          <div className="metric-row" key={key}><span>{key}</span><strong>{value}</strong></div>
                        ))}
                      </div>
                      <p className="focus-note" id="focusNote">{skill.note}</p>
                    </div>
                  </div>
                  <section className="profile-assessment" aria-labelledby="sample-dribble-title">
                    <div>
                      <span className="card-kicker">Dribbling shuttle · Sample results</span>
                      <h4 id="sample-dribble-title">How does Alex compare?</h4>
                      <dl>
                        <div><dt>Alex on test day</dt><dd>{SAMPLE_DRIBBLE_RESULT}</dd></div>
                        <div><dt>Team average that day</dt><dd>6.05 s</dd></div>
                        <div><dt>Club U16 average</dt><dd>6.40 s</dd></div>
                        <div><dt>Club U17 average</dt><dd>6.10 s</dd></div>
                      </dl>
                      <p>A shorter time is faster. The club averages come from different players who took the same test at each age.</p>
                    </div>
                    <div>
                      <span className="card-kicker">What to practice next</span>
                      <h4>Keep the ball close through turns.</h4>
                      <p>Alex’s plan uses the Figure-8 dribble. Weave around two cones, using short touches with the inside and outside of your feet.</p>
                      <button type="button" className="profile-workout-action" onClick={onOpenWorkout}>Try Alex’s dribbling workout <span aria-hidden="true">→</span></button>
                    </div>
                  </section>
                </div>
              </div>
            </div>
);
}
