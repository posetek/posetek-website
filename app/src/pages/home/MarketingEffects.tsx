import { useEffect, useRef, useState } from "react";

const reduceQuery = "(prefers-reduced-motion: reduce)";
const fineQuery = "(hover: hover) and (pointer: fine)";

/** The accessible text and layout never change while the decorative copy resolves. */
export function ScrambleText({ children, className = "" }: { children: string; className?: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const [visual, setVisual] = useState(children);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const trigger = node.closest("a,button,[data-scramble-trigger]") || node;
    const motion = matchMedia(reduceQuery), pointer = matchMedia(fineQuery);
    let timer = 0;
    const stop = () => { clearInterval(timer); timer = 0; setVisual(children); node.dataset.scrambling = "false"; };
    const start = () => {
      if (motion.matches || !pointer.matches || document.hidden || timer) return;
      const started = performance.now();
      node.dataset.scrambling = "true";
      const tick = () => {
        const progress = (performance.now() - started) / 520;
        if (progress >= 1) { stop(); return; }
        setVisual(Array.from(children).map((letter, index) => /\s/.test(letter) || index / children.length < progress
          ? letter : "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+[]"[Math.floor(Math.random() * 40)]).join(""));
      };
      tick(); timer = window.setInterval(tick, 40);
    };
    trigger.addEventListener("pointerenter", start);
    for (const event of ["pointerleave", "pointerdown", "focusin"]) trigger.addEventListener(event, stop);
    motion.addEventListener("change", stop);
    pointer.addEventListener("change", stop);
    document.addEventListener("visibilitychange", stop);
    window.addEventListener("blur", stop);
    return () => {
      clearInterval(timer);
      trigger.removeEventListener("pointerenter", start);
      for (const event of ["pointerleave", "pointerdown", "focusin"]) trigger.removeEventListener(event, stop);
      motion.removeEventListener("change", stop); pointer.removeEventListener("change", stop);
      document.removeEventListener("visibilitychange", stop); window.removeEventListener("blur", stop);
    };
  }, [children]);
  return <span ref={host} className={`interaction-text ${className}`} data-scrambling="false"><span className="interaction-text-source">{children}</span><span className="interaction-text-visual" aria-hidden="true">{visual}</span></span>;
}

