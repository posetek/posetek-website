import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MarketingAudience } from "./MarketingHeader";

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
      let current = 0;
      chapters.forEach((chapter, index) => {
        const node = document.getElementById(chapter.id);
        if (node && node.getBoundingClientRect().top <= window.innerHeight * .38) current = index;
      });
      setActive(current);
      const footer = document.querySelector(".marketing-footer");
      setShowProgress(window.scrollY > 500 && (!footer || footer.getBoundingClientRect().top > window.innerHeight - 70));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
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

/** A short, nonblocking tiled reveal around real, independently mounted demonstrations. */
export function RevealFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    const node = host.current;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (!node || motion.matches || !("IntersectionObserver" in window)) return;
    let timer = 0;
    const stop = () => { setRevealing(false); window.clearTimeout(timer); };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setRevealing(!motion.matches);
      timer = window.setTimeout(stop, 620);
      observer.disconnect();
    }, { threshold: .08 });
    observer.observe(node);
    motion.addEventListener("change", stop);
    return () => { observer.disconnect(); window.clearTimeout(timer); motion.removeEventListener("change", stop); };
  }, []);
  return <div ref={host} className={`reveal-frame ${className}`} data-revealing={revealing} onPointerDownCapture={() => setRevealing(false)} onFocusCapture={() => setRevealing(false)}>
    {children}
    {revealing && <div className="pixel-reveal" aria-hidden="true">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ animationDelay: `${((index * 7) % 11) * 18}ms` }} />)}</div>}
  </div>;
}

export function HeadingReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = host.current;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (!node || motion.matches || !("IntersectionObserver" in window)) return;
    let animation: Animation | undefined;
    const stop = () => animation?.cancel();
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      if (!motion.matches) animation = node.animate([
        { clipPath: "inset(0 0 100% 0)", transform: "translateY(22px)" },
        { clipPath: "inset(0)", transform: "translateY(0)" },
      ], { duration: 620, easing: "cubic-bezier(.16,1,.3,1)" });
      observer.disconnect();
    }, { threshold: .1 });
    observer.observe(node);
    motion.addEventListener("change", stop);
    return () => { observer.disconnect(); stop(); motion.removeEventListener("change", stop); };
  }, []);
  return <div ref={host} className={className}>{children}</div>;
}

/** Desktop-only decoration; it never substitutes for a link or covers demo inputs. */
export function MarketingCursor() {
  const cursor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = cursor.current;
    if (!node) return;
    const pointer = matchMedia("(hover: hover) and (pointer: fine)");
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const hide = () => { node.dataset.visible = "false"; };
    const move = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("a[data-cursor]") : null;
      if (!pointer.matches || motion.matches || !target) { hide(); return; }
      node.textContent = target.dataset.cursor || "Explore";
      node.style.transform = `translate3d(${Math.min(event.clientX + 18, window.innerWidth - 150)}px,${Math.min(event.clientY + 18, window.innerHeight - 60)}px,0)`;
      node.dataset.visible = "true";
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("blur", hide);
    document.addEventListener("mouseleave", hide);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("scroll", hide); window.removeEventListener("blur", hide); document.removeEventListener("mouseleave", hide); };
  }, []);
  return <div ref={cursor} className="marketing-cursor" aria-hidden="true" data-visible="false" />;
}
