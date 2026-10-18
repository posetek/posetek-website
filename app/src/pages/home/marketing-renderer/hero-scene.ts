import { Color, CylinderGeometry, DirectionalLight, DoubleSide, Float32BufferAttribute, Group, HemisphereLight, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Quaternion, Scene, ShaderMaterial, SphereGeometry, Spherical, Vector3, type BufferGeometry, type Material } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createBall } from "../pitch/ball";
import { HERO_FADE_MS, HERO_POSES, POSE_EDGES, type HeroPose, type HeroPoseId } from "../latest-hero/pose-model";
import { STAGE_FOV, STAGE_TARGET, stageCameraPosition } from "../latest-hero/stage-camera";
import type { HeroView } from "./protocol";
import type { WorkerScene } from "./scene";

const shadowVertex = "varying vec2 shadowUv; void main() { shadowUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const shadowFragment = `varying vec2 shadowUv; uniform float strength;
void main() { float d = length((shadowUv - 0.5) * 2.0);
float softness = exp(-d * d * 5.5); float edge = 1.0 - smoothstep(0.7, 1.0, d);
gl_FragColor = vec4(0.006, 0.018, 0.012, softness * edge * strength);
#include <colorspace_fragment>
}`;

function createFigure(pose: HeroPose) {
  const group = new Group();
  const opacity: Array<{ material: Material; factor: number }> = [];
  const edges = [...POSE_EDGES.filter(([a, b]) => a >= 11 && b >= 11), [0, 7], [0, 8], [7, 11], [8, 12]];
  const tubes = edges.map(([a, b]) => {
    const start = new Vector3(...pose.points[a]), end = new Vector3(...pose.points[b]);
    const direction = end.clone().sub(start);
    const hand = a >= 15 && a <= 22 && b >= 15 && b <= 22;
    const tube = new CylinderGeometry(hand || a < 11 ? .002 : .003, hand || a < 11 ? .002 : .003, direction.length(), 8);
    const color = new Color(a % 2 === b % 2 ? a % 2 ? "#d8fba2" : "#c1f5e5" : "#ecf6d9");
    const colors = new Float32Array(tube.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    tube.setAttribute("color", new Float32BufferAttribute(colors, 3));
    tube.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()));
    tube.translate(...start.add(end).multiplyScalar(.5).toArray());
    return tube;
  });
  const bones = mergeGeometries(tubes)!; tubes.forEach(tube => tube.dispose());
  const boneMaterial = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: true, depthWrite: false, toneMapped: false });
  const boneMesh = new Mesh(bones, boneMaterial); boneMesh.renderOrder = 3; group.add(boneMesh);
  opacity.push({ material: boneMaterial, factor: 1 });
  const pointMaterial = new MeshBasicMaterial({ color: "#ffffff", transparent: true, depthTest: true, depthWrite: false, toneMapped: false });
  const points = new InstancedMesh(new SphereGeometry(1, 12, 8), pointMaterial, 33);
  const matrix = new Matrix4();
  pose.points.forEach(([x, y, z], index) => {
    const radius = index < 11 ? .004 : index > 16 && index < 23 ? .005 : .009;
    points.setMatrixAt(index, matrix.makeScale(radius, radius, radius).setPosition(x, y, z));
    points.setColorAt(index, new Color(index > 10 && index % 2 === 0 ? "#c1f5e5" : "#ddffac"));
  });
  points.instanceMatrix.needsUpdate = true;
  if (points.instanceColor) points.instanceColor.needsUpdate = true;
  points.renderOrder = 4; group.add(points); opacity.push({ material: pointMaterial, factor: 1 });
  if (pose.ball) {
    const ball = createBall(), ballGroup = new Group();
    ballGroup.position.set(...pose.ball.position); ballGroup.scale.setScalar(pose.ball.radius / 1.47);
    for (const [geometry, color] of [[ball.hexagons, "#d9e4bf"], [ball.pentagons, "#11261a"]] as const) {
      const material = new MeshStandardMaterial({ color, roughness: .7, side: DoubleSide, transparent: true });
      ballGroup.add(new Mesh(geometry, material)); opacity.push({ material, factor: 1 });
    }
    const lines = new LineBasicMaterial({ color: "#829a68", transparent: true, opacity: .35 });
    ballGroup.add(new LineSegments(ball.edges, lines)); opacity.push({ material: lines, factor: .35 }); group.add(ballGroup);
  }
  const shadow = new ShaderMaterial({ uniforms: { strength: { value: 0 } }, vertexShader: shadowVertex, fragmentShader: shadowFragment, transparent: true, depthWrite: false });
  const plane = new Mesh(new PlaneGeometry(2, 2), shadow);
  plane.position.set((pose.points[23][0] + pose.points[24][0]) / 2, .003, (pose.points[23][2] + pose.points[24][2]) / 2);
  plane.rotation.x = -Math.PI / 2; plane.scale.set(...(pose.id === "jump" ? [1.08, .73, 1] : [.88, .56, 1]) as [number, number, number]);
  plane.renderOrder = -1; group.add(plane);
  return { group, setOpacity(value: number) { opacity.forEach(item => { item.material.opacity = value * item.factor; }); shadow.uniforms.strength.value = value * (pose.id === "jump" ? .33 : .7); } };
}

export function createHeroScene(initial: HeroView): WorkerScene {
  const scene = new Scene(), camera = new PerspectiveCamera(STAGE_FOV, 1, .1, 100);
  const target = new Vector3(...(initial.camera?.target ?? STAGE_TARGET));
  camera.position.set(...(initial.camera?.position ?? stageCameraPosition("reset"))); camera.lookAt(target);
  scene.add(new HemisphereLight("#e8f6e7", "#244135", 1.3));
  for (const [position, intensity, color] of [[[-3, 5, 4], 2.6, "#f0ffde"], [[3, 2, -3], 2.1, "#a6e4d8"], [[4, 1, 3], .5, "#b3cebf"]] as const) {
    const light = new DirectionalLight(color, intensity); light.position.set(position[0], position[1], position[2]); scene.add(light);
  }
  const figures = new Map(HERO_POSES.map(pose => [pose.id, createFigure(pose)]));
  for (const [id, figure] of figures) { figure.setOpacity(id === initial.pose ? 1 : 0); scene.add(figure.group); }
  const stage = new Mesh(new PlaneGeometry(4.7, 4.7), new ShaderMaterial({
    uniforms: { baseColor: { value: new Color("#3a6654") }, lineColor: { value: new Color("#87ae94") } },
    vertexShader: "varying vec2 stageUv; void main() { stageUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: `varying vec2 stageUv; uniform vec3 baseColor; uniform vec3 lineColor;
void main() { vec2 p=(stageUv-0.5)*2.0; float radius=length(p); float falloff=1.0-smoothstep(0.18,1.0,radius);
float ring=1.0-smoothstep(0.001,0.005,abs(radius-0.62)); float center=1.0-smoothstep(0.001,0.004,abs(radius-0.11));
float detail=ring*0.2+center*0.07; gl_FragColor=vec4(mix(baseColor,lineColor,min(1.0,detail*4.0)),falloff*0.19+detail);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
    transparent: true, depthWrite: false, side: DoubleSide,
  }));
  stage.rotation.x = -Math.PI / 2; stage.position.y = -.012; stage.renderOrder = -2; scene.add(stage);
  let view = initial, current = initial.pose, previous: HeroPoseId | null = null, blend = 1, lastCommand = initial.command;
  const rotate = (x: number, y: number) => {
    const orbit = new Spherical().setFromVector3(camera.position.clone().sub(target));
    orbit.theta -= x; orbit.phi = Math.max(.75, Math.min(1.55, orbit.phi - y));
    camera.position.copy(new Vector3().setFromSpherical(orbit).add(target)); camera.lookAt(target);
  };
  return {
    scene, camera,
    update(next, immediate = false) {
      if (next.kind !== "hero") return;
      view = next;
      if (next.pose !== current) { previous = next.reducedMotion || immediate ? null : current; current = next.pose; blend = next.reducedMotion || immediate ? 1 : 0; }
      if (next.reducedMotion || immediate) { previous = null; blend = 1; }
      if (next.command !== lastCommand) {
        lastCommand = next.command;
        if (next.action === "reset" || next.action === "front" || next.action === "side") { target.set(...STAGE_TARGET); camera.position.set(...stageCameraPosition(next.action)); camera.lookAt(target); }
        else rotate(next.action === "left" ? Math.PI / 8 : next.action === "right" ? -Math.PI / 8 : 0, next.action === "up" ? .15 : next.action === "down" ? -.15 : 0);
      }
    },
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); },
    step(seconds) {
      if (view.rotating && !view.reducedMotion) rotate(seconds * 2 * Math.PI / 60 * .42, 0);
      if (blend < 1) blend = Math.min(1, blend + seconds * 1000 / HERO_FADE_MS);
      const eased = blend * blend * (3 - 2 * blend);
      if (blend === 1) previous = null;
      figures.forEach((figure, id) => { figure.group.visible = id === current || id === previous; figure.setOpacity(id === current ? eased : id === previous ? 1 - eased : 0); });
      return view.rotating && !view.reducedMotion || blend < 1;
    },
    orbit(x, y) { rotate(x * 2 * Math.PI * .65, y * 2 * Math.PI * .65); },
    telemetry() { return { angle: new Spherical().setFromVector3(camera.position.clone().sub(target)).theta, position: camera.position.toArray(), target: target.toArray() }; },
    dispose() {
      const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
      scene.traverse(object => { if (object instanceof Mesh || object instanceof LineSegments) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); } });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); scene.clear();
    },
  };
}
