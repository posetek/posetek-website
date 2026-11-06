// Canvas drawing for lib/drillEvidence.ts: trails (optionally phase-coloured),
// anchors (starting COM, apex, peak…), gate verticals down to the ground, the
// ball (ring per frame, or resting ball + flight for a kick) and the per-frame
// readout. Styling follows the phone's replay (PoseSceneMarkers, ShuttleSessionView,
// SprintPoseOverlayCanvas, DeadballPoseExtrasOverlay).

import type { Point } from "../lib/repTools";
import type { DrillEvidence } from "../lib/drillEvidence";
import { EVIDENCE_COLORS } from "../lib/drillEvidence";

type MapFn = (point: Point) => Point;
interface Content { x: number; y: number; w: number; h: number }

export function drawDrillEvidence(ctx: CanvasRenderingContext2D, map: MapFn, content: Content, frame: number, evidence: DrillEvidence, groundY: (x: number) => number | null) {
  ctx.save();
  ctx.font = "700 11px Inter, system-ui, sans-serif";

  // Gate verticals, top of the frame down to the ground.
  for (const gate of evidence.gates) {
    const top = map({ x: gate.x, y: 0 });
    const ground = groundY(gate.x);
    const bottom = map({ x: gate.x, y: ground ?? 1 });
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = gate.color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(top.x, content.y); ctx.lineTo(bottom.x, bottom.y); ctx.stroke();
    ctx.setLineDash([]);
    // Below the stage badges, on the inner side of the line.
    const inner = top.x < content.x + content.w / 2;
    const width = ctx.measureText(gate.label).width + 8;
    const lx = inner ? top.x + 6 : top.x - 6 - width;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(lx, content.y + 50, width, 16);
    ctx.fillStyle = gate.color;
    ctx.textAlign = "left";
    ctx.fillText(gate.label, lx + 4, content.y + 62);
  }

  // Trails up to the current frame.
  for (const trail of evidence.trails) {
    const from = trail.window === null ? 0 : Math.max(0, frame - trail.window);
    const colorAt = (f: number) => trail.phases?.find(phase => f >= phase.from && f <= phase.to)?.color ?? trail.color;
    ctx.lineWidth = 2.5;
    let previous: Point | null = null;
    for (let f = from; f <= Math.min(frame, trail.points.length - 1); f++) {
      const point = trail.points[f];
      if (!point) { previous = null; continue; }
      const p = map(point);
      if (previous) {
        ctx.strokeStyle = colorAt(f);
        ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      previous = p;
    }
    const current = trail.points[frame];
    if (current) {
      const p = map(current);
      ctx.fillStyle = colorAt(frame);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  // Ball: a ring per frame (COD / dribbling ball_boxes.json).
  const ballBox = evidence.ballBoxes?.[frame];
  if (ballBox) {
    const a = map({ x: ballBox.x1, y: ballBox.y1 }), b = map({ x: ballBox.x2, y: ballBox.y2 });
    const r = Math.max(4, Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 2);
    ctx.strokeStyle = EVIDENCE_COLORS.ball;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, r, 0, Math.PI * 2); ctx.stroke();
  }

  // Kick: resting ball before contact, then the tracked flight up to this frame.
  if (evidence.kick) {
    const { rest, trajectory, contactFrame } = evidence.kick;
    const size = rest ? { w: Math.abs(rest.x2 - rest.x1) / 2, h: Math.abs(rest.y2 - rest.y1) / 2 } : { w: 0.01, h: 0.01 };
    const ellipse = (center: Point, color: string, dashed = false) => {
      const c = map(center);
      ctx.setLineDash(dashed ? [3, 3] : []);
      ctx.strokeStyle = color;
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(3, size.w * content.w), Math.max(3, size.h * content.h), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
    };
    const restCenter = rest ? { x: (rest.x1 + rest.x2) / 2, y: (rest.y1 + rest.y2) / 2 } : null;
    const flight = trajectory.filter(item => contactFrame === null || item.frame > contactFrame);
    if (flight.length) {
      ctx.strokeStyle = "rgba(124, 255, 24, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (const item of flight) {
        if (item.frame > frame) break;
        const p = map(item.point);
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    const now = trajectory.find(item => item.frame === frame)
      ?? (contactFrame !== null && frame > contactFrame ? [...trajectory].reverse().find(item => item.frame <= frame) : undefined);
    if (contactFrame !== null && frame > contactFrame && now) ellipse(now.point, EVIDENCE_COLORS.ball);
    else if (restCenter) ellipse(restCenter, EVIDENCE_COLORS.ball);
    if (restCenter && contactFrame !== null && frame > contactFrame) ellipse(restCenter, "rgba(124, 255, 24, 0.45)", true);
  }

  // Anchors: fixed reference points (starting COM, apex, peak, finish). Labels
  // that would overlap step down and keep a leader line to their point.
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const overlaps = (r: { x: number; y: number; w: number; h: number }) => placed.some(o => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h);
  for (const anchor of evidence.anchors) {
    const p = map(anchor.point);
    const active = anchor.frame !== null && anchor.frame === frame;
    ctx.strokeStyle = anchor.color;
    ctx.fillStyle = active ? anchor.color : "rgba(0, 0, 0, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x + 7, p.y); ctx.lineTo(p.x, p.y + 7); ctx.lineTo(p.x - 7, p.y); ctx.closePath();
    ctx.fill(); ctx.stroke();
    const label = `${anchor.label}${anchor.frame !== null ? ` · f${anchor.frame}` : ""}`;
    const rect = { x: p.x + 12, y: p.y - 8, w: ctx.measureText(label).width + 8, h: 16 };
    for (let attempt = 0; attempt < 8 && overlaps(rect); attempt++) rect.y += 18;
    placed.push(rect);
    if (rect.y !== p.y - 8) {
      ctx.strokeStyle = anchor.color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x + 6, p.y); ctx.lineTo(rect.x, rect.y + rect.h / 2); ctx.stroke();
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.66)";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = anchor.color;
    ctx.textAlign = "left";
    ctx.fillText(label, rect.x + 4, rect.y + 12);
  }

  // Readout (phase, speed, height at this frame), bottom left of the frame.
  const lines = evidence.readout(frame);
  lines.forEach((text, index) => {
    ctx.font = "800 13px Inter, system-ui, sans-serif";
    const width = ctx.measureText(text).width + 16;
    const y = content.y + content.h - 14 - (lines.length - 1 - index) * 24;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(content.x + 12, y - 15, width, 22);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(text, content.x + 20, y + 1);
  });
  ctx.restore();
}
