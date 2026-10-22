import { useState } from "react";
import { JUMP_ANGLE_FIELDS, JUMP_PHASES, jumpFrames, previewJumpTechnique, type JumpSources } from "../lib/jumpTechnique";
import { pushJumpTechnique } from "../lib/repToolsData";
import AdminModal from "./AdminModal";

type Props = {
  playerId: string; repId: string; athleteName: string; source: JumpSources;
  originalHeight: number | null; originalAngles: Record<string, unknown>; revisionId: string | null;
  currentFrame: number; lastFrame: number; seekTo: (frame: number) => void;
  onSaved: (revisionId: string) => void;
};
export default function JumpTechniqueEditor(props: Props) {
  const expected = jumpFrames(props.source["key_frames.json"]);
  const [frames, setFrames] = useState<(number | null)[]>(expected ?? [null, null, null, null]);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  let preview: ReturnType<typeof previewJumpTechnique> | null = null, problem: string | null = null;
  try { preview = previewJumpTechnique(frames as number[], props.source, props.originalHeight); }
  catch (error) { problem = error instanceof Error ? error.message : "Jump evidence is unavailable."; }
  const set = (index: number, value: number | null) => setFrames(current => current.map((f, i) => i === index ? value : f));
  const displayAngles = (value: unknown) => Array.isArray(value) && value.length === 5 ? value.map(n => typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(1)}°` : "—").join(" / ") : "Not recorded";
  async function save() {
    if (!preview || !expected || !note.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const result = await pushJumpTechnique({ playerId: props.playerId, repId: props.repId, drill: "jump", note: note.trim(),
        jumpTechnique: { keyFrames: frames as number[], expectedKeyFrames: expected, expectedRevisionId: props.revisionId } });
      props.onSaved(result.revisionId);
    } catch (error) { setError(error instanceof Error ? error.message : "The correction could not be saved."); setSaving(false); }
  }
  return <section className="admin-card rt-jump-technique">
    <h3>Jump technique</h3>
    <p className="admin-note">Review each phase against the video. Angles are calculated from the saved joint positions; changing a phase updates its angles and chart range together.</p>
    {!expected && <p role="alert">Saved jump phase frames are unavailable. Reload or recover the recording before correcting technique.</p>}
    <div className="rt-frame-fields">
      {JUMP_PHASES.map((label, index) => <div className="rt-frame-field" key={label}>
        <span className="rt-frame-label">{label}</span>
        <input aria-label={`${label} technique frame`} type="number" min={0} max={props.lastFrame} value={frames[index] ?? ""} disabled={saving || !expected}
          onChange={event => set(index, event.target.value === "" ? null : Number(event.target.value))} />
        <button className="quiet-button small" type="button" disabled={saving || !expected} onClick={() => set(index, props.currentFrame)}>Use current</button>
        <button className="quiet-button small" type="button" disabled={frames[index] === null} onClick={() => props.seekTo(frames[index]!)}>View</button>
      </div>)}
    </div>
    <p className="admin-note">Angles: ankle / knee / hip / shoulder / elbow.</p>
    <table className="rt-diff"><thead><tr><th>Phase</th><th>Saved angles</th><th>Reviewed angles</th></tr></thead><tbody>
      {JUMP_PHASES.map((phase, i) => <tr key={phase}><td>{phase}</td><td>{displayAngles(props.originalAngles[JUMP_ANGLE_FIELDS[i]])}</td><td>{preview ? displayAngles(preview.angles[i]) : "Unavailable"}</td></tr>)}
    </tbody></table>
    <p>Jump height: {preview?.height != null ? `${preview.height.toFixed(6)} m` : "Not recorded"}{frames[3] === expected?.[3] ? " — unchanged" : " — recalculated from the selected peak"}.</p>
    {problem && <p className="form-message" role="alert">{problem}</p>}
    <label className="admin-field"><span>Technique correction note</span><textarea maxLength={2000} value={note} disabled={saving} onChange={event => setNote(event.target.value)} placeholder="Describe the video evidence for this correction." /></label>
    {error && <p className="form-message" role="alert">{error}</p>}
    <button className="primary-cta" type="button" disabled={saving || !preview?.changed || !note.trim()} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setConfirming(true); }}>Review technique correction</button>
    {confirming && <AdminModal label="Save jump technique correction" onClose={() => setConfirming(false)} dismissDisabled={saving}>
      <h3>Save reviewed jump technique?</h3><p>{props.athleteName}: {frames.join(" → ")}. The selected frames, angles and available motion charts will be saved with a restorable revision.</p>
      <p>{frames[3] === expected?.[3] ? "Jump height stays unchanged." : `Jump height becomes ${preview?.height?.toFixed(6)} m.`} Failure flags stay unchanged.</p>
      <blockquote>{note}</blockquote>
      {error && <p role="alert">{error}</p>}
      <div className="admin-dialog-actions"><button className="quiet-button" type="button" disabled={saving} onClick={() => setConfirming(false)}>Keep reviewing</button><button className="primary-cta" type="button" disabled={saving} onClick={save}>{saving ? "Saving technique…" : "Save technique correction"}</button></div>
    </AdminModal>}
  </section>;
}
