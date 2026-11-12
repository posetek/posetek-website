import PersonalizedPrograms from "../../admin/views/PersonalizedPrograms";
import type { PlannerRole } from "../../admin/lib/plannerScope";
import type { Access } from "../lib/loaders";
import type { Row } from "./execution";

/**
 * The planner's authority for whoever has the workspace open. An athlete plans for themselves; an
 * admin, manager or coach looking at an athlete plans with their own staff permissions, for that
 * athlete only. A shared link plans for nobody: it keeps the athlete role, which the planner refuses.
 */
export function plannerRole(access: Access | undefined): PlannerRole {
  return access === "admin" ? "admin" : access === "coach" || access === "manager" ? "staff" : "athlete";
}

/** Both athlete experiences share draft generation, review and explicit activation. */
export default function ProgramIntake({ playerId, preview, access, weeks, initialText = "", onReady, onBack }: {
  playerId: string; athlete: Row; statsProfile: Row; preview: boolean; access?: Access; initialText?: string; onReady: () => void; onBack: () => void;
  /** The plan length the form opens with, when the button that opened it named one. */
  weeks?: number;
}) {
  const role = plannerRole(access);
  return <section className="player-intake">
    <button className="quiet-button" onClick={onBack}>Back to training</button>
    {preview ? <div className="portal-card"><h2>Personalized training</h2><p>Sign in to build a draft from your results and review it before activation.</p><button className="primary-cta" onClick={onReady}>Return to sample training</button></div>
      : <PersonalizedPrograms key={playerId} role={role} only={role !== "athlete"} playerId={playerId} initialWeeks={weeks} initialText={initialText} onActivated={onReady} />}
  </section>;
}
