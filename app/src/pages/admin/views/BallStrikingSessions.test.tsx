import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
vi.mock("../../../lib/firebase", () => ({ default: {}, auth: {} }));
import BallStrikingSessions, { TechniqueSessionList, TechniqueSessionOverview, TechniqueTurn } from "./BallStrikingSessions";
import { TECHNIQUE_PREVIEW_DETAIL } from "../lib/ballStrikingPreview";
import { normalizeTechniqueSessionDetail } from "../lib/ballStriking";
const html = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

describe("readable ball striking session review", () => {
  it("shows goal/reference/memory, evidence, concise decision and generated reply without claiming audio delivery", () => {
    const markup = html(<><TechniqueSessionOverview session={TECHNIQUE_PREVIEW_DETAIL.session} /><TechniqueTurn turn={TECHNIQUE_PREVIEW_DETAIL.turns[0]} /></>);
    for (const label of ["Keep the shot low", "Instep drive", "Session memory now", "Revision 0", "Plant foot distance", "Athlete", "Reference", "Decision summary", "Coach reply", "Audio delivery and acknowledgement are unknown", "Response time 2.1 s"]) expect(markup).toContain(label);
    expect(markup).not.toContain("Athlete heard"); expect(markup).not.toContain("<pre"); expect(markup).not.toContain("<textarea");
  });
  it("makes uncertain failures and missing measurements explicit without a fabricated cue", () => {
    const failed = html(<TechniqueTurn turn={TECHNIQUE_PREVIEW_DETAIL.turns[2]} />);
    expect(failed).toContain("Completion uncertain"); expect(failed).toContain("No coach reply was saved");
    expect(failed).toContain("completion could not be confirmed"); expect(failed).not.toContain("class=\"technique-reply\"");
    const turn = structuredClone(TECHNIQUE_PREVIEW_DETAIL.turns[0]); turn.tools[0].evidence[0].athlete = null;
    expect(html(<TechniqueTurn turn={turn} />)).toContain("Unavailable");
  });
  it("renders text as text, and never exposes extra prompt/thinking/tool-argument fields", () => {
    const source = structuredClone(TECHNIQUE_PREVIEW_DETAIL), script = '<img src=x onerror="alert(1)">';
    source.turns[0].spokenOutput = script; source.turns[0].tools[0].evidence[0].label = script;
    const projected = normalizeTechniqueSessionDetail({ ...source, turns: source.turns.map(turn => ({ ...turn, thinking: "HIDDEN_THOUGHT", rawPrompt: "PRIVATE_PROMPT" })) }, source.session);
    const markup = html(<TechniqueTurn turn={projected.turns[0]} />);
    expect(markup).toContain("&lt;img"); expect(markup).not.toContain("<img"); expect(markup).not.toContain('onerror="');
    expect(markup).not.toContain("HIDDEN_THOUGHT"); expect(markup).not.toContain("PRIVATE_PROMPT");
  });
  it("has an honest empty state and isolated sample preview", () => {
    expect(html(<TechniqueSessionList sessions={[]} />)).toContain("No coaching sessions yet");
    const markup = html(<BallStrikingSessions preview />);
    expect(markup).toContain("Synthetic preview"); expect(markup).toContain("Alex Rivera");
    expect(markup).toContain("preview=1"); expect(markup).toContain("General technique coaching");
  });
});
