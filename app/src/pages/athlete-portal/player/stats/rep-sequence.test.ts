import { describe, expect, it } from 'vitest';
import type { PosePoint as ParsedPoint } from '../../../../lib/pose-playback';
import type { ReplayTracking } from '../../../../lib/replay-tracking';
import {
  CENTER_MAX_GAP_S, NOMINAL_FPS, STAGE_ASPECT, alignShadow, buildRepReplay, clipPhases, clipWindow, flightFrameRate, frameRate, pictureSize, repScene, shadowClock,
  smoothCenterLine, stageAspect,
} from './rep-sequence';
import type { RepFiles, RepReplay } from './rep-sequence';

const FPS = 120;

/** A walker tracked on every fourth frame: x = 0.2 + 0.3 t, a 0.16-tall box standing on y = 0.58. */
function walker(count: number, options: { skip?: [number, number]; outlier?: number; jitter?: number } = {}): ReplayTracking {
  const frames = Array.from({ length: count }, (_, index) => {
    const t = index / FPS;
    const examined = index % 4 === 0 && !(options.skip && index >= options.skip[0] && index <= options.skip[1]);
    if (!examined) return { person: null, com: null, ball: null };
    // Frame-to-frame box jitter: a fixed pseudo-random sequence in [-1, 1].
    const wobble = (options.jitter ?? .003) * (((index * 7919) % 13) - 6) / 6;
    const x = .2 + .3 * t + wobble, h = index === options.outlier ? .32 : .16 + wobble, bottom = .58 - wobble;
    return { person: { x: x - .03, y: bottom - h, w: .06, h }, com: { x, y: bottom - h / 2 }, ball: null };
  });
  return { frames, fps: FPS, timestampsMs: frames.map(() => null) };
}

const files = (overrides: Partial<RepFiles>): RepFiles => ({ drill: 'jump', rep: {}, metadata: {}, frames: [], tracking: null, json: {}, video: null, ...overrides });

/** A 33-landmark pose standing at hip x `x`, feet on y = 0.6. */
function pose(x: number, lift = 0): ParsedPoint[] {
  return Array.from({ length: 33 }, (_, index) => ({ x: x + (index % 2 ? .01 : -.01), y: .2 + index / 33 * .4 - lift, visibility: .9 }));
}

describe('smoothCenterLine', () => {
  it('fills the unexamined frames along the motion and keeps the line as tall as the body', () => {
    const lines = smoothCenterLine(walker(240), FPS);
    for (const frame of [41, 42, 43, 101, 150]) {
      const line = lines[frame]!;
      expect(line.x).toBeCloseTo(.2 + .3 * frame / FPS, 2);
      expect(line.bottom - line.top).toBeCloseTo(.16, 2);
      expect(line.bottom).toBeCloseTo(.58, 2);
    }
  });

  it('drops a box that jumps away from its neighbours instead of following it', () => {
    const lines = smoothCenterLine(walker(240, { outlier: 80 }), FPS);
    for (const frame of [78, 80, 82]) expect(lines[frame]!.bottom - lines[frame]!.top).toBeCloseTo(.16, 2);
  });

  it('is steadier than the boxes it comes from', () => {
    const tracking = walker(240, { jitter: .01 });
    const lines = smoothCenterLine(tracking, FPS);
    const rawError = tracking.frames.flatMap((frame, index) => frame.com ? [Math.abs(frame.com.x - (.2 + .3 * index / FPS))] : []);
    const smoothError = lines.flatMap((line, index) => line && index % 4 === 0 && index > 20 && index < 220 ? [Math.abs(line.x - (.2 + .3 * index / FPS))] : []);
    expect(Math.max(...smoothError)).toBeLessThan(Math.max(...rawError) / 2);
  });

  it('leaves a long stretch with no tracked body empty, and bridges a short one', () => {
    const lines = smoothCenterLine(walker(240, { skip: [100, 180] }), FPS);
    const gapMiddle = 140;
    expect((gapMiddle - 96) / FPS).toBeGreaterThan(CENTER_MAX_GAP_S);
    expect(lines[gapMiddle]).toBeNull();
    expect(lines[98]).not.toBeNull();
    expect(lines[186]).not.toBeNull();
  });

  it('draws nothing when no body was tracked', () => {
    expect(smoothCenterLine({ frames: [{ person: null, com: null, ball: null }], fps: FPS, timestampsMs: [null] }, FPS)).toEqual([null]);
  });
});

describe('picture size and frame rate', () => {
  it('reads the size saved with the rep, else off an ArUco marker, else the recording header', () => {
    expect(pictureSize({ videoDisplayWidth: 1280, videoDisplayHeight: 720 })).toEqual({ width: 1280, height: 720 });
    // The vertical jump station: an upright 720 × 1280 picture, known only from its marker.
    const marker = { centerPixel: { x: 416.937950134277, y: 774.086807250977 }, centerNormalized: { x: .579080486297607, y: .604755318164825 } };
    expect(pictureSize({ arucoMarkers: [marker] })).toEqual({ width: 720, height: 1280 });
    expect(pictureSize({}, { width: 1920, height: 1080, duration: 4 })).toEqual({ width: 1920, height: 1080 });
    expect(pictureSize({})).toBeNull();
  });

  it('takes the saved rate, else the recording length, else the jump flight', () => {
    expect(frameRate(files({ metadata: { framesPerSecond: 119.94 } }), 900)).toBeCloseTo(119.94);
    expect(frameRate(files({ video: { width: 720, height: 1280, duration: 4.1 } }), 492)).toBeCloseTo(120);
    // The broad jump: 44 frames between takeoff and landing over a 0.3555 s flight.
    const fit = { takeoffFrame: 226.232875759343, landingFrame: 270.232427150861 };
    expect(frameRate(files({ drill: 'broadJump', rep: { flightTimeSeconds: .3555046026369654 }, json: { 'foot_piecewise_fit.json': fit } }), 467)).toBeCloseTo(123.77, 1);
    expect(flightFrameRate({ flightTimeSeconds: .5 }, {})).toBeNull();
    expect(frameRate(files({}), 100)).toBeNull();
  });
});

describe('scene', () => {
  const gate = { startXNorm: .19, stopXNorm: .83, groundYNorm: .585, groundLine: { point1: { x: .19, y: .585 }, point2: { x: .83, y: .583 } } };

  it('puts a single narrow marker\'s bottom edge across the picture as the ground', () => {
    const marker = { id: 3, cornersNormalized: [{ x: .56, y: .59 }, { x: .6, y: .594 }, { x: .597, y: .618 }, { x: .557, y: .615 }] };
    const scene = repScene(files({ metadata: { arucoMarkers: [marker], ground_loc_y: .61 } }), null);
    expect(scene.calibration?.markers).toEqual([{ id: 3, corners: [[.56, .59], [.6, .594], [.597, .618], [.557, .615]] }]);
    expect(scene.calibration?.ground?.start[0]).toBe(0);
    expect(scene.calibration?.ground?.end[0]).toBe(1);
    expect(scene.calibration?.ground?.start[1]).toBeCloseTo(.6165, 4);
  });

  it('draws the gate as a measured distance along the ground', () => {
    const scene = repScene(files({ metadata: { arucoGate: gate, markerDistance: 9.5 } }), null);
    expect(scene.gate).toEqual({ left: .19, right: .83, distanceMeters: 9.5 });
    expect(scene.calibration?.baseline?.distanceMeters).toBe(9.5);
    expect(scene.calibration?.baseline?.start[1]).toBeCloseTo(.585, 4);
  });

  it('has no scene when the rep saved none', () => {
    expect(repScene(files({}), null).calibration).toBeUndefined();
  });
});

describe('clipPhases', () => {
  it('starts a clip that opens mid-phase with that phase, and leaves out phases after it', () => {
    const list: [number | null, string, string][] = [[0, 'Ready', 'grey'], [86, 'Out', 'blue'], [417, 'Turn', 'yellow'], [null, 'Back', 'green'], [900, 'Finish', 'grey']];
    expect(clipPhases(list, 100, 500)).toEqual([{ from: 0, title: 'Out', color: 'blue' }, { from: 317, title: 'Turn', color: 'yellow' }]);
    expect(clipPhases(list, 26, 900)?.map(phase => phase.title)).toEqual(['Ready', 'Out', 'Turn', 'Finish']);
  });
});

describe('clipWindow', () => {
  it('keeps the action and a margin, inside the frames that can be drawn', () => {
    expect(clipWindow([10, 11, 400], 100, 200, 250, 1, .5)).toEqual([100, 300]);
    expect(clipWindow([150, 160, 260], 100, 200, 250, 1, .5)).toEqual([150, 260]);
    expect(clipWindow([5, 9], 100, null, null, 1, 1)).toEqual([5, 9]);
  });
});

describe('buildRepReplay', () => {
  it('builds a vertical jump the way the homepage clip was built', () => {
    const frames = Array.from({ length: 600 }, (_, index) => index < 20 ? [] : pose(.5, index > 228 && index < 274 ? .1 : 0));
    const torso = Array.from({ length: 600 }, (_, index) => [.5, .45 - (index > 228 && index < 274 ? .1 : 0)]);
    const replay = buildRepReplay(files({
      drill: 'jump', frames, rep: { jumpHeight: .1764 },
      metadata: { ground_loc_y: .616, chest_starting_loc: .503, m_to_normalized_units: 4.66, videoDisplayWidth: 720, videoDisplayHeight: 1280 },
      json: { 'key_frames.json': [196, 208, 228, 261], 'torso_midpoints.json': torso },
      video: { width: 720, height: 1280, duration: 5 },
    }))!;
    const first = Math.round(228 - 1.5 * 120);
    expect(replay.sequence.fps).toBeCloseTo(120);
    expect(replay.nominalRate).toBe(false);
    expect(replay.sequence.frames).toHaveLength(Math.round(261 + 1.4 * 120) - first + 1);
    expect(replay.anchor).toBe(228 - first);
    expect(replay.sequence.phases).toEqual([
      { from: 0, title: 'Load', color: '#66c2ff' }, { from: 228 - first, title: 'Flight', color: '#b7f34a' }, { from: 262 - first, title: 'Descent', color: '#ffc969' },
    ]);
    const jump = replay.sequence.verticalJump!;
    expect(jump.peakMeters).toBeCloseTo(.1764);
    expect(jump.heightMeters).toEqual([]);
    expect(jump.com[0]).toEqual([.5, .45]);
    expect(jump.groundY).toBe(.616);
    expect(replay.scene).toMatchObject({ aspect: 720 / 1280, metersPerWidth: 4.66, groundY: .616 });
    expect(stageAspect(replay)).toBe(STAGE_ASPECT.min);
  });

  it('builds a broad jump with the foot fit, its trails and its distance', () => {
    const frames = Array.from({ length: 467 }, () => pose(.5));
    const fit = { takeoffFrameIndex: 226, landingFrameIndex: 270, startFootXNorm: .4755, endFootXNorm: .6743, takeoffFrame: 226.23, landingFrame: 270.23 };
    const replay = buildRepReplay(files({
      drill: 'broadJump', frames, rep: { broadJumpDistance: 1.1993, flightTimeSeconds: .3555 },
      metadata: { ground_loc_y: .502, m_to_normalized_units: 5.69, arucoMarkers: [{ id: 0, centerPixel: { x: 864.78, y: 524.7 }, centerNormalized: { x: .45040625, y: .48583333 } }] },
      json: { 'foot_piecewise_fit.json': fit, 'foot_centers.json': frames.map(() => [.48, .45]), 'com_midpoints.json': frames.map(() => [.45, .25]) },
    }))!;
    const fps = 44 / .3555, first = Math.round(226 - 1.5 * fps);
    expect(replay.sequence.fps).toBeCloseTo(fps);
    expect(replay.sequence.markers).toEqual({ takeoff: 226 - first, landing: 270 - first });
    expect(replay.sequence.metrics).toEqual([['Distance', '3.9 ft']]);
    expect(replay.sequence.overlays).toMatchObject({ groundY: .502, takeoffX: .4755, landingX: .6743 });
    expect(replay.sequence.overlays!.com).toHaveLength(replay.sequence.frames.length);
    expect(replay.scene).toMatchObject({ originX: .4755, direction: 1, metersPerWidth: 5.69 });
    expect(replay.scene.aspect).toBeCloseTo(1920 / 1080, 2);
  });

  it('builds a shuttle run recorded without pose as a phased centre line between its gate markers', () => {
    const tracking = walker(910);
    const replay = buildRepReplay(files({
      drill: 'changeOfDirection', tracking,
      metadata: { framesPerSecond: FPS, videoDisplayWidth: 1280, videoDisplayHeight: 720, startFrame: 86, phase1EndFrame: 416, apexFrame: 509, phase2EndFrame: 590, endFrame: 780,
        markerDistance: 9.5, arucoGate: { startXNorm: .19, stopXNorm: .83, groundYNorm: .585 } },
    }))!;
    const first = 86 - 60;
    expect(replay.sequence.frames.length).toBe(780 + 90 - first + 1);
    expect(replay.sequence.frames.every(frame => frame.length === 0)).toBe(true);
    expect(replay.sequence.centerLine).toHaveLength(replay.sequence.frames.length);
    expect(replay.sequence.phases?.map(phase => [phase.title, phase.from])).toEqual([['Ready', 0], ['Out', 60], ['Turn', 417 - first], ['Back', 591 - first], ['Finish', 781 - first]]);
    expect(replay.sequence.calibration?.baseline?.distanceMeters).toBe(9.5);
    expect(replay.anchor).toBe(60);
    expect(replay.scene.originX).toBe(.19);
    expect(replay.scene.direction).toBe(1);
    expect(replay.scene.metersPerWidth).toBeCloseTo(9.5 / .64);
    expect(stageAspect(replay)).toBe(STAGE_ASPECT.max);
  });

  it('plays a jump with no saved or measurable rate at the phone\'s capture rate, and says so', () => {
    const replay = buildRepReplay(files({ drill: 'jump', frames: Array.from({ length: 50 }, () => pose(.5)) }))!;
    expect(replay.sequence.fps).toBe(NOMINAL_FPS);
    expect(replay.nominalRate).toBe(true);
  });

  it('has nothing to replay without pose or tracking', () => {
    expect(buildRepReplay(files({ drill: 'sprint' }))).toBeNull();
  });
});

describe('the team median as a shadow', () => {
  const replay = (scene: Partial<RepReplay['scene']>, frames: (number[] | null)[][], fps = FPS, anchor: number | null = null): RepReplay => ({
    sequence: { key: 'broadJump', title: '', label: '', markers: {}, metrics: [], frames, fps },
    anchor, metadata: {}, nominalRate: false,
    scene: { aspect: 16 / 9, groundY: null, metersPerWidth: null, originX: null, direction: null, ...scene },
  });

  it('moves the shadow onto the athlete\'s start spot and ground, at the athlete\'s scale in metres', () => {
    const own = replay({ originX: .4, groundY: .5, metersPerWidth: 5 }, [[]]);
    const shadow = replay({ originX: .6, groundY: .55, metersPerWidth: 4 }, [[[.7, .45], null]]);
    const [point, missing] = alignShadow(own, shadow).frames[0];
    // 1 m is 0.2 of the athlete's picture and 0.25 of the shadow's: the shadow shrinks by 0.8.
    expect(point![0]).toBeCloseTo(.4 + .1 * .8);
    expect(point![1]).toBeCloseTo(.5 - .1 * .8);
    expect(missing).toBeNull();
  });

  it('mirrors a shadow that went the other way and keeps body shape across picture shapes', () => {
    const own = replay({ originX: .4, groundY: .5, direction: 1, aspect: 16 / 9 }, [[]]);
    const shadow = replay({ originX: .6, groundY: .5, direction: -1, aspect: 9 / 16 }, [[[.7, .4]]]);
    const [point] = alignShadow(own, shadow).frames[0];
    expect(point![0]).toBeCloseTo(.3);
    expect(point![1]).toBeCloseTo(.5 - .1 * (16 / 9) / (9 / 16));
  });

  it('moves a centre line and leaves the cached shadow unchanged', () => {
    const own = replay({ originX: .2, groundY: .6 }, [[]]);
    const shadow = replay({ originX: .3, groundY: .5 }, [[]]);
    shadow.sequence.centerLine = [{ x: .35, top: .34, bottom: .5 }, null];
    const before = JSON.stringify(shadow);
    expect(alignShadow(own, shadow).centerLine).toEqual([{ x: .25, top: expect.closeTo(.44, 6), bottom: .6 }, null]);
    expect(JSON.stringify(shadow)).toBe(before);
  });

  it('runs both replays in real time from the frame they line up on', () => {
    const own = replay({}, Array.from({ length: 200 }, () => []), 120, 50);
    const shadow = replay({}, Array.from({ length: 100 }, () => []), 60, 20);
    const clock = shadowClock(own, shadow);
    expect(clock(50)).toBe(20);
    expect(clock(70)).toBe(30);
    expect(clock(0)).toBe(0);
    expect(clock(199)).toBe(95);
    expect(clock(1000)).toBe(99);
    expect(shadowClock({ ...own, anchor: null }, shadow)(40)).toBe(20);
  });
});
