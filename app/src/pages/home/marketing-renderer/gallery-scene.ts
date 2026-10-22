import { LinearFilter, Mesh, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, SRGBColorSpace, Texture, Vector2, type WebGLRenderer } from "three";
import type { GalleryCard, GalleryView, RendererView } from "./protocol";
import type { WorkerScene } from "./scene";
import { GALLERY_TEXTURE_LIMIT, dampGalleryValue, galleryBendTarget } from "./gallery-model";
import { galleryRevealProgress } from "./gallery-reveal";

// A real segmented surface: curvature is in viewport/world space, before projection.
export const galleryVertexShader = `
  uniform float uBend;
  uniform float uHalfHeight;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    float vertical = clamp(world.y / max(uHalfHeight, 1.0), -1.6, 1.6);
    world.z += uBend * vertical * vertical * uHalfHeight;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const fragmentShader = `
  uniform sampler2D uImage;
  uniform vec2 uTexel;
  uniform float uZoom;
  uniform float uBlur;
  uniform float uReveal;
  uniform float uFluidReveal;
  uniform float uRevealPixels;
  varying vec2 vUv;
  vec4 sampleImage(vec2 uv, float pixelSize) {
    if (pixelSize > 1.0) {
      vec2 block = uTexel * pixelSize;
      uv = (floor(uv / block) + .5) * block;
    }
    vec2 offset = uTexel * uBlur;
    vec4 color = texture2D(uImage, uv) * .4;
    color += texture2D(uImage, uv + vec2(offset.x, 0.0)) * .15;
    color += texture2D(uImage, uv - vec2(offset.x, 0.0)) * .15;
    color += texture2D(uImage, uv + vec2(0.0, offset.y)) * .15;
    color += texture2D(uImage, uv - vec2(0.0, offset.y)) * .15;
    return color;
  }
  void main() {
    vec2 uv = .5 + (vUv - .5) / uZoom;
    if (uFluidReveal > .5) {
      // Blend neighboring grids instead of snapping every card through the same
      // six resolutions. Non-accent chapters sample the sharp artwork directly.
      float level = log2(max(1.0, uRevealPixels));
      float fine = exp2(floor(level));
      gl_FragColor = sampleImage(uv, fine);
      if (uRevealPixels > 1.0) gl_FragColor = mix(gl_FragColor, sampleImage(uv, fine * 2.0), smoothstep(0.0, 1.0, fract(level)));
    } else {
      gl_FragColor = sampleImage(uv, exp2(floor((1.0 - uReveal) * 6.0 + .00001)));
    }
    #include <colorspace_fragment>
  }
`;

type Reveal = { epoch: number; progress: number };
type Entry = {
  src: string; card: GalleryCard; controller: AbortController;
  mesh: Mesh<PlaneGeometry, ShaderMaterial>; bitmap?: ImageBitmap; texture?: Texture;
  promise: Promise<void>; failed: boolean; hover: number; tiltX: number; tiltY: number;
  reveal: Reveal; pulse: number; wasHovered: boolean; loading: boolean;
};

/** One scene/context serves the entire gallery. No demo component or live DOM is rendered here. */
export function createGalleryScene(initial: GalleryView, invalidate: () => void): WorkerScene {
  const scene = new Scene(), camera = new PerspectiveCamera(45, initial.width / initial.height, .1, 10000);
  const geometry = new PlaneGeometry(1, 1, 1, 32);
  const entries = new Map<string, Entry>();
  // Tiny lifecycle records outlive texture eviction; residency is not a reveal reset.
  const reveals = new Map<string, Reveal>();
  const failedSources = new Set<string>();
  const cancelled = new Set<string>();
  let view = initial, disposed = false, bend = 0, bendTarget = 0, velocityAge = 1;
  let scrollRevision = -1, drawn: string[] = [];

  const release = (entry: Entry) => {
    if (entry.loading) cancelled.add(entry.card.id);
    entry.controller.abort(); scene.remove(entry.mesh); entry.mesh.material.dispose();
    entry.texture?.dispose(); entry.bitmap?.close();
  };
  const material = () => new ShaderMaterial({
    vertexShader: galleryVertexShader, fragmentShader, transparent: true, depthTest: false,
    toneMapped: false, uniforms: {
      uImage: { value: null }, uTexel: { value: new Vector2(1 / 1200, 1 / 900) },
      uBend: { value: 0 }, uHalfHeight: { value: initial.height / 2 },
      uZoom: { value: 1.06 }, uBlur: { value: 0 }, uReveal: { value: 0 },
      uFluidReveal: { value: 0 }, uRevealPixels: { value: 1 },
    },
  });
  const load = async (entry: Entry) => {
    try {
      const response = await fetch(entry.src, { signal: entry.controller.signal, credentials: "omit", mode: "same-origin" });
      if (!response.ok) throw new Error("preview-http");
      const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: "flipY", resizeWidth: 1200, resizeHeight: 900, resizeQuality: "high" });
      if (disposed || entry.controller.signal.aborted) { bitmap.close(); return; }
      entry.bitmap = bitmap;
      const texture = new Texture(bitmap); texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true;
      texture.generateMipmaps = false; texture.minFilter = LinearFilter; entry.texture = texture;
      entry.mesh.material.uniforms.uImage.value = texture;
      entry.mesh.material.uniforms.uTexel.value.set(1 / bitmap.width, 1 / bitmap.height);
      invalidate();
    } catch {
      if (!disposed && !entry.controller.signal.aborted) { entry.failed = true; failedSources.add(entry.src); invalidate(); }
    } finally { entry.loading = false; }
  };
  const sync = () => {
    const cards = view.cards.slice(0, GALLERY_TEXTURE_LIMIT);
    for (const [id, entry] of entries) {
      if (!cards.some(card => card.id === id && card.src === entry.src)) { release(entry); entries.delete(id); }
    }
    for (const card of cards) {
      let reveal = reveals.get(card.id);
      if (!reveal || reveal.epoch !== card.revealEpoch) {
        reveal = { epoch: card.revealEpoch, progress: card.settled ? 1 : 0 }; reveals.set(card.id, reveal);
      } else if (card.settled) reveal.progress = 1;
      let entry = entries.get(card.id);
      if (!entry) {
        const mesh = new Mesh(geometry, material()); mesh.frustumCulled = false;
        entry = { src: card.src, card, mesh, controller: new AbortController(), promise: Promise.resolve(), failed: failedSources.has(card.src), hover: 0, tiltX: 0, tiltY: 0, reveal, pulse: 1, wasHovered: false, loading: !failedSources.has(card.src) };
        entries.set(card.id, entry); scene.add(mesh);
        if (!entry.failed) entry.promise = load(entry);
      }
      if (card.hovered && !entry.wasHovered) entry.pulse = 0;
      if (!card.hovered && entry.wasHovered) entry.pulse = 1;
      entry.wasHovered = card.hovered; entry.card = card;
      entry.reveal = reveal;
    }
  };
  const update = (next: RendererView) => {
    if (next.kind !== "gallery" || next === view && entries.size) return;
    view = next;
    if (view.scrollRevision !== scrollRevision) {
      scrollRevision = view.scrollRevision; bendTarget = galleryBendTarget(view.velocity); velocityAge = 0;
    }
    sync();
  };
  const resize = () => {
    camera.aspect = view.width / view.height;
    camera.position.z = view.height / (2 * Math.tan(Math.PI / 8));
    camera.far = camera.position.z + 5000; camera.updateProjectionMatrix();
  };
  sync(); resize();
  return {
    scene, camera, update, resize, orbit() {},
    pause() {
      bend = bendTarget = 0; velocityAge = 1;
      for (const entry of entries.values()) { entry.hover = entry.tiltX = entry.tiltY = 0; entry.pulse = 1; entry.wasHovered = false; }
    },
    async prepare() { await Promise.all([...entries.values()].map(entry => entry.promise)); },
    step(seconds) {
      resize(); velocityAge += seconds;
      if (velocityAge > .08) bendTarget = 0;
      bend = dampGalleryValue(bend, bendTarget, seconds, bendTarget > bend ? 10 : 4);
      if (Math.abs(bend - bendTarget) < .00015) bend = bendTarget;
      let moving = bend !== bendTarget || velocityAge <= .08 && bendTarget > 0;
      for (const entry of entries.values()) {
        const { card, mesh } = entry;
        const visible = card.y + card.height > view.scrollY && card.y < view.scrollY + view.height && card.x + card.width > view.scrollX && card.x < view.scrollX + view.width;
        mesh.visible = !!entry.texture;
        const hover = card.hovered ? 1 : 0;
        entry.hover = dampGalleryValue(entry.hover, hover, seconds, 10);
        const x = card.hovered ? -card.pointerY * (Math.PI / 45) : 0, y = card.hovered ? card.pointerX * (Math.PI / 30) : 0;
        entry.tiltX = dampGalleryValue(entry.tiltX, x, seconds, 10);
        entry.tiltY = dampGalleryValue(entry.tiltY, y, seconds, 10);
        if (Math.abs(entry.hover - hover) < .001) entry.hover = hover;
        if (Math.abs(entry.tiltX - x) < .0001) entry.tiltX = x;
        if (Math.abs(entry.tiltY - y) < .0001) entry.tiltY = y;
        if (entry.texture && visible) entry.reveal.progress = Math.min(1, entry.reveal.progress + seconds / (card.revealProfile?.duration ?? .65));
        entry.pulse = Math.min(1, entry.pulse + seconds / .64);
        mesh.position.set(card.x - view.scrollX + card.width / 2 - view.width / 2, view.height / 2 - (card.y - view.scrollY + card.height / 2), 0);
        mesh.scale.set(card.width, card.height, 1); mesh.rotation.set(entry.tiltX, entry.tiltY, 0);
        const uniforms = mesh.material.uniforms;
        const profile = card.revealProfile;
        const progress = profile ? galleryRevealProgress(entry.reveal.progress, profile) : entry.reveal.progress;
        uniforms.uBend.value = bend * (profile?.bendScale ?? 1); uniforms.uHalfHeight.value = view.height / 2;
        uniforms.uZoom.value = 1 + entry.hover * .08 + (1 - progress) * (profile ? .02 : .06);
        uniforms.uReveal.value = entry.reveal.progress;
        uniforms.uFluidReveal.value = profile ? 1 : 0;
        uniforms.uRevealPixels.value = profile ? 1 + (profile.pixels - 1) * (1 - progress) : 1;
        uniforms.uBlur.value = entry.pulse < 1 ? Math.sin(entry.pulse * Math.PI) * 1.2 : 0;
        moving ||= !!entry.texture && visible && (entry.hover !== hover || entry.tiltX !== x || entry.tiltY !== y || entry.reveal.progress < 1 || entry.pulse < 1);
      }
      return moving;
    },
    render(renderer: WebGLRenderer) {
      const autoClear = renderer.autoClear;
      renderer.autoClear = false; renderer.setScissorTest(false); renderer.clear(); drawn = [];
      for (const entry of entries.values()) entry.mesh.visible = false;
      for (const [id, entry] of entries) {
        const { card } = entry;
        const left = Math.max(0, card.x - view.scrollX), top = Math.max(0, card.y - view.scrollY);
        const right = Math.min(view.width, card.x - view.scrollX + card.width), bottom = Math.min(view.height, card.y - view.scrollY + card.height);
        if (!entry.texture || right <= left || bottom <= top) continue;
        renderer.setScissor(left, view.height - bottom, right - left, bottom - top); renderer.setScissorTest(true);
        entry.mesh.visible = true; renderer.render(scene, camera); entry.mesh.visible = false; drawn.push(id);
      }
      renderer.setScissorTest(false); renderer.autoClear = autoClear;
    },
    telemetry: () => ({ galleryRevision: view.revision, galleryScrollY: view.scrollY, galleryScrollX: view.scrollX, galleryCards: drawn,
      galleryFailed: [...entries].filter(([, entry]) => entry.failed).map(([id]) => id), galleryTextures: entries.size,
      galleryReveals: [...reveals].map(([id, reveal]) => ({ id, epoch: reveal.epoch, progress: reveal.progress, complete: reveal.progress === 1 })),
      galleryPending: [...entries].filter(([, entry]) => entry.loading).map(([id]) => id), galleryCancelled: [...cancelled], bend }),
    dispose() { disposed = true; for (const entry of entries.values()) release(entry); entries.clear(); reveals.clear(); geometry.dispose(); },
  };
}
