import { useEffect, useId, useRef, useState } from "react";
import approvedBadge from "../../../astro/public/brand/posetek-p.svg?raw";

// The extrusion and static alternative share the exact P contour in the approved
// website badge. No font approximation or separately drawn logo is introduced.
const approvedPath = approvedBadge.match(/<path\b[^>]*\bd="([^"]+)"/)?.[1] ?? "";

/** A decorative, scroll-responsive mark; WebGL never gates footer content. */
export function DimensionalMark() {
  const mount = useRef<HTMLDivElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  const gradientId = useId();

  useEffect(() => {
    const element = mount.current;
    if (!element || !approvedPath || typeof IntersectionObserver === "undefined") return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const pointerSurface = element.closest(".marketing-footer") ?? element;
    let disposed = false;
    let intersecting = false;
    let initializing = false;
    let failed = false;
    let frame = 0;
    let draw: ((now: number) => boolean) | undefined;
    let previousFrame = 0;
    const target = { x: 0, y: 0 };
    const aim = { x: 0, y: 0 };
    const tilt = { x: 0, y: 0 };
    const releases: Array<() => void> = [];
    const isActive = () => intersecting && !document.hidden && !motion.matches && !disposed;
    const clearScene = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previousFrame = 0;
      draw = undefined;
      element.dataset.markMotion = "idle";
      for (const release of releases.splice(0).reverse()) release();
    };
    const requestDraw = () => {
      if (!draw || frame) return;
      if (!isActive()) { update(); return; }
      frame = requestAnimationFrame(now => {
        frame = 0;
        if (!isActive()) { update(); return; }
        try {
          const settling = draw?.(now);
          element.dataset.markMotion = settling ? "settling" : "idle";
          if (settling) requestDraw();
        } catch {
          failed = true;
          clearScene();
          setEnhanced(false);
        }
      });
    };

    const initialize = async () => {
      if (initializing || draw || failed || !isActive()) return;
      initializing = true;
      try {
        const [THREE, { SVGLoader }, { RoomEnvironment }] = await Promise.all([
          import("three"),
          import("three/addons/loaders/SVGLoader.js"),
          import("three/addons/environments/RoomEnvironment.js"),
        ]);
        if (!isActive()) return;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        releases.push(() => { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setClearColor(0x04130e, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        renderer.domElement.setAttribute("aria-hidden", "true");
        const onContextLoss = (event: Event) => {
          event.preventDefault();
          failed = true;
          clearScene();
          if (!disposed) setEnhanced(false);
        };
        renderer.domElement.addEventListener("webglcontextlost", onContextLoss);
        releases.push(() => renderer.domElement.removeEventListener("webglcontextlost", onContextLoss));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
        camera.position.set(0, 0.05, 5.6);
        const room = new RoomEnvironment();
        const generator = new THREE.PMREMGenerator(renderer);
        const environment = (() => {
          try { return generator.fromScene(room, 0.04); }
          finally { room.dispose(); generator.dispose(); }
        })();
        scene.environment = environment.texture;
        releases.push(() => environment.dispose());
        const key = new THREE.DirectionalLight(0xecffdd, 2.3);
        key.position.set(-3, 4, 5);
        scene.add(key, new THREE.HemisphereLight(0xffffff, 0x204a2b, 1.4));

        const paths = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${approvedPath}"/></svg>`).paths;
        const shapes = paths.flatMap(path => SVGLoader.createShapes(path));
        const geometry = new THREE.ExtrudeGeometry(shapes, {
          depth: 180, bevelEnabled: true, bevelSegments: 4,
          steps: 1, bevelSize: 24, bevelThickness: 24, curveSegments: 18,
        });
        releases.push(() => geometry.dispose());
        geometry.center();
        geometry.scale(0.0017, 0.0017, 0.0017);
        const material = new THREE.MeshStandardMaterial({ color: 0xd9dfd9, metalness: 1, roughness: 0.24 });
        releases.push(() => material.dispose());
        const mark = new THREE.Mesh(geometry, material);
        scene.add(mark);
        element.appendChild(renderer.domElement);

        let previousWidth = 0;
        let previousHeight = 0;
        draw = now => {
          const bounds = element.getBoundingClientRect();
          const width = Math.round(bounds.width);
          const height = Math.round(bounds.height);
          if (!width || !height) return false;
          if (width !== previousWidth || height !== previousHeight) {
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.position.z = Math.max(5.6, 4.2 / camera.aspect);
            camera.updateProjectionMatrix();
            previousWidth = width;
            previousHeight = height;
          }
          const elapsed = previousFrame ? Math.min((now - previousFrame) / 1000, 1 / 20) : 1 / 60;
          previousFrame = now;
          // The reference uses two damped stages: pointer aim at 5/s, then tilt
          // at 3.2/s. Continue only until these bounded offsets have settled.
          const aimEase = 1 - Math.exp(-elapsed * 5);
          const tiltEase = 1 - Math.exp(-elapsed * 3.2);
          for (const axis of ["x", "y"] as const) {
            aim[axis] += (target[axis] - aim[axis]) * aimEase;
            tilt[axis] += (aim[axis] - tilt[axis]) * tiltEase;
          }
          const footerBounds = pointerSurface.getBoundingClientRect();
          const rise = Math.max(0, Math.min(1, (window.innerHeight * .6 - footerBounds.top) / Math.max(1, footerBounds.height - window.innerHeight * .4)));
          mark.position.y = -(1 - rise) * .7;
          mark.rotation.set(-.3 + (1 - rise) * .5 + tilt.x * .17, -.24 + tilt.y * .32, .02);
          element.dataset.markTiltX = (tilt.x * .17).toFixed(4);
          element.dataset.markTiltY = (tilt.y * .32).toFixed(4);
          element.dataset.markRise = rise.toFixed(4);
          renderer.render(scene, camera);
          setEnhanced(true);
          const settling = Math.abs(target.x - aim.x) + Math.abs(target.y - aim.y)
            + Math.abs(aim.x - tilt.x) + Math.abs(aim.y - tilt.y) > .0006;
          if (!settling) {
            aim.x = tilt.x = target.x;
            aim.y = tilt.y = target.y;
            previousFrame = 0;
          }
          return settling;
        };
        requestDraw();
      } catch {
        failed = true;
        clearScene();
        if (!disposed) setEnhanced(false);
      } finally {
        initializing = false;
      }
    };

    const update = () => {
      if (!isActive()) {
        cancelAnimationFrame(frame);
        frame = 0;
        previousFrame = 0;
        target.x = target.y = aim.x = aim.y = tilt.x = tilt.y = 0;
        element.dataset.markMotion = "idle";
        element.dataset.markTiltX = element.dataset.markTiltY = "0.0000";
        if (motion.matches) setEnhanced(false);
        return;
      }
      if (draw) requestDraw();
      else void initialize();
    };
    const resetPointer = () => {
      target.x = target.y = 0;
      requestDraw();
    };
    const movePointer = (event: Event) => {
      if (!(event instanceof PointerEvent) || event.pointerType === "touch" || !pointer.matches || !isActive()) return;
      const bounds = pointerSurface.getBoundingClientRect();
      target.x = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      target.y = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      requestDraw();
    };
    const observer = new IntersectionObserver(entries => {
      intersecting = entries.some(entry => entry.isIntersecting);
      update();
    }, { threshold: 0 });
    observer.observe(element);
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(requestDraw);
    resize?.observe(element);
    window.addEventListener("scroll", requestDraw, { passive: true });
    window.addEventListener("resize", requestDraw, { passive: true });
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    pointerSurface.addEventListener("pointermove", movePointer, { passive: true });
    pointerSurface.addEventListener("pointerleave", resetPointer);
    pointerSurface.addEventListener("pointercancel", resetPointer);
    pointer.addEventListener("change", resetPointer);
    window.addEventListener("blur", resetPointer);
    return () => {
      disposed = true;
      observer.disconnect();
      resize?.disconnect();
      window.removeEventListener("scroll", requestDraw);
      window.removeEventListener("resize", requestDraw);
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
      pointerSurface.removeEventListener("pointermove", movePointer);
      pointerSurface.removeEventListener("pointerleave", resetPointer);
      pointerSurface.removeEventListener("pointercancel", resetPointer);
      pointer.removeEventListener("change", resetPointer);
      window.removeEventListener("blur", resetPointer);
      clearScene();
    };
  }, []);

  return <div className="marketing-footer-mark" ref={mount} data-mark-state={enhanced ? "enhanced" : "static"} aria-hidden="true">
    <svg className="marketing-footer-mark-fallback" viewBox="0 0 1600 1750" focusable="false">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stopColor="#8d9a90"/><stop offset="0.26" stopColor="#f0f1eb"/><stop offset="0.58" stopColor="#778a7e"/><stop offset="0.77" stopColor="#d8ded6"/><stop offset="1" stopColor="#adb9ad"/></linearGradient></defs>
      <path d={approvedPath} transform="translate(100 1640) scale(1 -1)" fill={`url(#${gradientId})`}/>
    </svg>
  </div>;
}
