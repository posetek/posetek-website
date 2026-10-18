import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { MarketingAudience } from "./marketing-links";
import { usePreviewMotion, useRepeatReveal } from "./marketing-effects";

const MARKETING_CHAPTERS = {
  players: [
    { id: "tests", label: "Test & review" },
    { id: "profile", label: "Athlete profile" },
    { id: "training", label: "Training" },
    { id: "ai-coach", label: "AI Coach" },
    { id: "technique", label: "Technique" },
    { id: "mobile-app", label: "Mobile app" },
  ],
  coaches: [
    { id: "club", label: "Your club" },
    { id: "players", label: "Every player" },
    { id: "development", label: "Development" },
    { id: "contact", label: "Get in touch" },
  ],
} as const;

/** Text remains readable to assistive technology throughout the decorative scramble. */
function ChapterLabel({ text }: { text: string }) {
  const [visual, setVisual] = useState(text);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      setVisual(text.split("").map((character, index) => index < step * 3 || character === " " ? character : "·/+"[(index + step) % 3]).join(""));
      if (step * 3 >= text.length) window.clearInterval(timer);
    }, 32);
    const finish = () => { if (motion.matches) { window.clearInterval(timer); setVisual(text); } };
    motion.addEventListener("change", finish);
    return () => { window.clearInterval(timer); motion.removeEventListener("change", finish); };
  }, [text]);
  return <span aria-label={text}><span aria-hidden="true">{visual}</span></span>;
}

/** Real fragment links preserve history and work before hydration. */
export function MarketingJourney({ audience }: { audience: MarketingAudience }) {
  const chapters = MARKETING_CHAPTERS[audience];
  const [active, setActive] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [progressHost, setProgressHost] = useState<Element | null>(null);
  useEffect(() => { setProgressHost(document.querySelector("[data-marketing-progress-slot]")); }, []);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current = 0, nearest = Infinity, nearestVisible = Infinity;
      chapters.forEach((chapter, index) => {
        const node = document.getElementById(chapter.id);
        if (!node) return;
        // A demo's outer frame exists before its lazy content. Contact has no
        // media, so its section itself provides the same visible-centre fallback.
        const media = node.querySelector<HTMLElement>("[data-gallery-media],.reveal-frame") || node;
        const bounds = media.getBoundingClientRect();
        if (bounds.height <= 0 || bounds.width <= 0) return;
        const distance = Math.abs(bounds.top + bounds.height / 2 - window.innerHeight / 2);
        const visible = bounds.bottom > 74 && bounds.top < window.innerHeight;
        if (visible && distance < nearestVisible) {
          nearestVisible = distance; current = index;
        } else if (nearestVisible === Infinity && distance < nearest) current = index;
        nearest = Math.min(nearest, distance);
      });
      setActive(current);
      const footer = document.querySelector(".marketing-footer");
      setShowProgress(window.scrollY > 500 && (!footer || footer.getBoundingClientRect().top > window.innerHeight - 70));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("marketing-gallery-position", schedule);
    const observer = "ResizeObserver" in window ? new ResizeObserver(schedule) : null;
    chapters.forEach(chapter => { const section = document.getElementById(chapter.id); if (section) observer?.observe(section); });
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); document.removeEventListener("marketing-gallery-position", schedule); };
  }, [chapters]);

  const progress = <div className="chapter-progress" data-visible={showProgress} aria-hidden="true"><span className="chapter-progress-cross">+</span><span>CHAPTER {String(active + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}</span><ChapterLabel key={active} text={chapters[active].label.toUpperCase()} /></div>;
  return <>
    <nav className="chapter-nav shell" aria-label={audience === "players" ? "The PoseTek method" : "Explore the team approach"}>
      <span className="chapter-nav-label">[ Explore the system ]</span>
      <div className="chapter-links">{chapters.map((chapter, index) => <a key={chapter.id} href={`#${chapter.id}`} aria-current={active === index ? "location" : undefined} onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        // Keep the native link's URL and scroll behavior; move keyboard focus only.
        requestAnimationFrame(() => {
          const heading = document.getElementById(chapter.id)?.querySelector<HTMLElement>("h2");
          if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
        });
      }}><span>{String(index + 1).padStart(2, "0")}</span>{chapter.label}</a>)}</div>
    </nav>
    {progressHost ? createPortal(progress, progressHost) : progress}
  </>;
}

/** Re-entering from below replays the reveal without remounting the live demonstration. */
export function RevealFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const { revealing, cycle, finish } = useRepeatReveal(host, "media");
  usePreviewMotion(host);
  return <div ref={host} className={`reveal-frame ${className}`} data-revealing={revealing} data-reveal-state="visible" onPointerDownCapture={finish} onFocusCapture={finish}>
    {children}
    {revealing && <div key={cycle} className="pixel-reveal" aria-hidden="true">{Array.from({ length: 48 }, (_, index) => <i key={index} style={{ animationDelay: `${((index * 7) % 5) * 80}ms` }} />)}</div>}
  </div>;
}

export function HeadingReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const { finish } = useRepeatReveal(host, "heading");
  return <div ref={host} className={`heading-reveal ${className}`} data-reveal-state="visible" onPointerDownCapture={finish} onFocusCapture={finish}>{children}</div>;
}

/** A bracketed, inert pointer hint. The native cursor and all control hit areas remain intact. */
export function MarketingCursor() {
  const cursor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = cursor.current;
    if (!node) return;
    const pointer = matchMedia("(hover: hover) and (pointer: fine)");
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, x = 0, y = 0, target: HTMLElement | null = null;
    const hide = () => { target = null; node.dataset.visible = "false"; cancelAnimationFrame(frame); frame = 0; };
    const draw = () => {
      frame = 0;
      const hit = document.elementFromPoint(x, y)?.closest("a[data-cursor]");
      if (!pointer.matches || motion.matches || document.hidden || !target || hit !== target || (document.documentElement.dataset.marketingNavigation || "closed") !== "closed") { hide(); return; }
      node.textContent = target.dataset.cursor || "Explore";
      const bounds = target.getBoundingClientRect(), centered = target.hasAttribute("data-preview-link");
      const width = node.offsetWidth, height = node.offsetHeight;
      const left = centered ? bounds.left + (bounds.width - width) / 2 : x + 18;
      const top = centered ? bounds.top + (bounds.height - height) / 2 : y + 18;
      node.style.transform = `translate3d(${Math.max(8, Math.min(left, innerWidth - width - 8))}px,${Math.max(8, Math.min(top, innerHeight - height - 8))}px,0)`;
      node.dataset.visible = "true";
    };
    const schedule = () => { if (target && !frame) frame = requestAnimationFrame(draw); };
    const move = (event: PointerEvent) => {
      target = event.target instanceof Element ? event.target.closest<HTMLElement>("a[data-cursor]") : null;
      if (!target || event.pointerType === "touch") { hide(); return; }
      x = event.clientX; y = event.clientY; schedule();
    };
    window.addEventListener("pointermove", move, { passive: true });
    // Keep the centered media hint attached during scrolling. A hit test removes
    // it as soon as the linked preview leaves the stationary pointer.
    window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", hide);
    window.addEventListener("marketing:navigation", hide);
    window.addEventListener("blur", hide); document.addEventListener("mouseleave", hide);
    document.addEventListener("pointerdown", hide); document.addEventListener("focusin", hide); document.addEventListener("visibilitychange", hide);
    pointer.addEventListener("change", hide); motion.addEventListener("change", hide);
    return () => {
      hide(); window.removeEventListener("pointermove", move); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", hide);
      window.removeEventListener("marketing:navigation", hide);
      window.removeEventListener("blur", hide); document.removeEventListener("mouseleave", hide); document.removeEventListener("pointerdown", hide);
      document.removeEventListener("focusin", hide); document.removeEventListener("visibilitychange", hide); pointer.removeEventListener("change", hide); motion.removeEventListener("change", hide);
    };
  }, []);
  return <div ref={cursor} className="marketing-cursor" aria-hidden="true" data-visible="false" />;
}
