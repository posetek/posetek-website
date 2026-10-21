import { DirectionalLight, ExtrudeGeometry, HemisphereLight, Mesh, MeshStandardMaterial, Path, PerspectiveCamera, PMREMGenerator, Scene, Shape, type WebGLRenderTarget } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import approvedShape from "./brand-shape.json";
import type { BrandView } from "./protocol";
import type { WorkerScene } from "./scene";

/** Exact approved contour, generated once; no DOMParser or SVGLoader in a worker. */
export function createBrandGeometry() {
  const shape = new Shape();
  let current: Shape | Path = shape, started = false;
  for (const command of approvedShape.commands) {
    const [kind, ...raw] = command, values = raw as number[];
    if (kind === "M") {
      if (started) { current = new Path(); shape.holes.push(current); }
      current.moveTo(values[0], values[1]); started = true;
    } else if (kind === "L") current.lineTo(values[0], values[1]);
    else if (kind === "Q") current.quadraticCurveTo(values[0], values[1], values[2], values[3]);
    else if (kind === "Z") current.closePath();
  }
  const geometry = new ExtrudeGeometry(shape, { depth: 180, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 24, bevelThickness: 24, curveSegments: 18 });
  geometry.center(); geometry.scale(.0017, .0017, .0017);
  return geometry;
}

export function createBrandScene(initial: BrandView): WorkerScene {
  const scene = new Scene(), camera = new PerspectiveCamera(32, 1, .1, 20);
  camera.position.set(0, .05, 5.6);
  const geometry = createBrandGeometry(), material = new MeshStandardMaterial({ color: 0xd9dfd9, metalness: 1, roughness: .24 });
  const mark = new Mesh(geometry, material); scene.add(mark);
  const key = new DirectionalLight(0xecffdd, 2.3); key.position.set(-3, 4, 5);
  scene.add(key, new HemisphereLight(0xffffff, 0x204a2b, 1.4));
  const aim = { x: 0, y: 0 }, tilt = { x: 0, y: 0 };
  let view = initial, settling = false, environment: WebGLRenderTarget | undefined;
  return {
    scene, camera,
    prepare(renderer) {
      const room = new RoomEnvironment(), generator = new PMREMGenerator(renderer);
      try { environment = generator.fromScene(room, .04); scene.environment = environment.texture; }
      finally { room.dispose(); generator.dispose(); }
    },
    update(next) { if (next.kind === "brand") view = next; },
    resize(aspect) { camera.aspect = aspect; camera.position.z = Math.max(5.6, 4.2 / aspect); camera.updateProjectionMatrix(); },
    step(seconds) {
      const aimEase = 1 - Math.exp(-seconds * 5), tiltEase = 1 - Math.exp(-seconds * 3.2);
      for (const axis of ["x", "y"] as const) { aim[axis] += (view[axis] - aim[axis]) * aimEase; tilt[axis] += (aim[axis] - tilt[axis]) * tiltEase; }
      settling = Math.abs(view.x - aim.x) + Math.abs(view.y - aim.y) + Math.abs(aim.x - tilt.x) + Math.abs(aim.y - tilt.y) > .0006;
      if (!settling) { aim.x = tilt.x = view.x; aim.y = tilt.y = view.y; }
      mark.position.y = -(1 - view.rise) * .7;
      mark.rotation.set(-.3 + (1 - view.rise) * .5 + tilt.x * .17, -.24 + tilt.y * .32, .02);
      return settling;
    },
    orbit() {},
    telemetry() { return { tiltX: tilt.x * .17, tiltY: tilt.y * .32, rise: view.rise, settling }; },
    dispose() { environment?.dispose(); geometry.dispose(); material.dispose(); scene.clear(); },
  };
}
