import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const DemoContext = createContext({ expanded: true, managed: false, expand: () => {} });

/** Outside marketing, existing demonstrations retain their complete presentation. */
export function useDemoDisclosure() { return useContext(DemoContext); }

/** One mounted demo, with optional detail revealed in the normal document flow. */
export function DemoDisclosure({ children, kind, label, expandSignal = 0 }: { children: ReactNode; kind: string; label: string; expandSignal?: number }) {
  const [expanded, setExpanded] = useState(false);
  const region = useId();
  const host = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const wasExpanded = useRef(false);
  const expand = useCallback(() => setExpanded(true), []);
  useLayoutEffect(() => {
    if (wasExpanded.current && !expanded && toggle.current) {
      // Collapsing a tall panel must not strand its focused control above the viewport.
      const button = toggle.current, bounds = button.getBoundingClientRect();
      const headerBottom = document.querySelector(".pt-marketing-bar")?.getBoundingClientRect().bottom || 0;
      if (bounds.top < headerBottom + 12) window.scrollBy({ top: bounds.top - headerBottom - 12, behavior: "instant" });
      else if (bounds.bottom > window.innerHeight - 12) window.scrollBy({ top: bounds.bottom - window.innerHeight + 12, behavior: "instant" });
    }
    wasExpanded.current = expanded;
  }, [expanded]);
  useEffect(() => { if (expandSignal > 0) setExpanded(true); }, [expandSignal]);
  useEffect(() => {
    if (!expanded) host.current?.querySelectorAll("video").forEach(video => video.pause());
  }, [expanded]);
  return <DemoContext.Provider value={{ expanded, managed: true, expand }}>
    <div ref={host} className={`demo-disclosure demo-disclosure-${kind}`} data-demo-expanded={expanded} data-gallery-media="">
      <div id={region} className="demo-disclosure-content">{children}</div>
      <button ref={toggle} type="button" className="demo-disclosure-toggle" aria-expanded={expanded} aria-controls={region} onClick={() => setExpanded(value => !value)}>
        <span>{expanded ? "Show less" : "Explore full demo"}</span><span className="demo-disclosure-context">{label}</span><span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
    </div>
  </DemoContext.Provider>;
}
