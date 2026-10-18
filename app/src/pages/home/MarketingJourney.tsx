import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MarketingAudience } from "./MarketingHeader";
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
    <div className="chapter-progress" data-visible={showProgress} aria-hidden="true"><span className="chapter-progress-cross">+</span><span>CHAPTER {String(active + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}</span><ChapterLabel key={active} text={chapters[active].label.toUpperCase()} /></div>
  </>;
}

/** Re-entering from below replays the reveal without remounting the live demonstration. */
export function RevealFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const { revealing, cycle, finish } = useRepeatReveal(host, "media");
  usePreviewMotion(host);
  return <div ref={host} className={`reveal-frame ${className}`} data-revealing={revealing} data-reveal-state="visible" onPointerDownCapture={finish} onFocusCapture={finish}>
    {children}
    {revealing && <div key={cycle} className="pixel-reveal" aria-hidden="true">{Array.from({ length: 48 }, (_, index) => <i key={index} style={{ animationDelay: `${((index * 7) % 13) * 22}ms` }} />)}</div>}
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
    let frame = 0, x = 0, y = 0;
    const hide = () => { node.dataset.visible = "false"; cancelAnimationFrame(frame); frame = 0; };
    const move = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("a[data-cursor]") : null;
      if (!pointer.matches || motion.matches || document.hidden || !target || document.querySelector('.pt-marketing-menu:not([hidden])')) { hide(); return; }
      node.textContent = target.dataset.cursor || "Explore";
      const bounds = target.getBoundingClientRect();
      const centered = target.hasAttribute("data-preview-link");
      x = centered ? bounds.left + bounds.width / 2 : event.clientX; y = centered ? bounds.top + bounds.height / 2 : event.clientY;
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        const width = node.offsetWidth, height = node.offsetHeight;
        node.style.transform = `translate3d(${Math.max(8, Math.min(x + (centered ? -width / 2 : 18), innerWidth - width - 8))}px,${Math.max(8, Math.min(y + (centered ? -height / 2 : 18), innerHeight - height - 8))}px,0)`;
        node.dataset.visible = "true";
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("scroll", hide, { passive: true }); window.addEventListener("resize", hide);
    window.addEventListener("blur", hide); document.addEventListener("mouseleave", hide);
    document.addEventListener("pointerdown", hide); document.addEventListener("focusin", hide); document.addEventListener("visibilitychange", hide);
    pointer.addEventListener("change", hide); motion.addEventListener("change", hide);
    return () => {
      hide(); window.removeEventListener("pointermove", move); window.removeEventListener("scroll", hide); window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide); document.removeEventListener("mouseleave", hide); document.removeEventListener("pointerdown", hide);
      document.removeEventListener("focusin", hide); document.removeEventListener("visibilitychange", hide); pointer.removeEventListener("change", hide); motion.removeEventListener("change", hide);
    };
  }, []);
  return <div ref={cursor} className="marketing-cursor" aria-hidden="true" data-visible="false" />;
}
