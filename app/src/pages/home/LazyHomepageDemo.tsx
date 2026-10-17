import { Component, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";

type DemoModule<P> = { default: ComponentType<P & { active?: boolean }> };

class DemoBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Each section loads independently, stays mounted, and only animates while visible. */
export function LazyHomepageDemo<P extends object>({ load, demoProps, label, kind, forceLoad = false }: {
  load: () => Promise<DemoModule<P>>;
  demoProps: P;
  label: string;
  kind: "movement" | "technique" | "coach" | "workout";
  forceLoad?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState<"load" | "render" | null>(null);
  const [Demo, setDemo] = useState<DemoModule<P>["default"] | null>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const preload = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNear(true); preload.disconnect(); }
    }, { rootMargin: "600px" });
    const visibility = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    preload.observe(node);
    visibility.observe(node);
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      preload.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if ((!near && !forceLoad) || Demo) return;
    let cancelled = false;
    // A stalled request must reach a useful recovery state. The import itself
    // cannot be aborted; a late result is ignored until the visitor retries.
    const timeout = window.setTimeout(() => {
      if (!cancelled) { cancelled = true; setFailed("load"); }
    }, 20_000);
    Promise.resolve().then(load).then(module => {
      window.clearTimeout(timeout);
      if (!cancelled) { setDemo(() => module.default); setFailed(null); }
    }).catch(() => {
      window.clearTimeout(timeout);
      if (!cancelled) setFailed("load");
    });
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [near, forceLoad, load, attempt, Demo]);

  const retry = () => { setFailed(null); setAttempt(value => value + 1); };
  // Browsers can cache rejected module imports for the current document. One
  // local retry preserves every other demo; only an explicit reload clears it.
  const reloadNeeded = failed === "load" && attempt > 0;
  const failure = <div className="homepage-demo-placeholder" role="status">
    <span className="eyebrow">{label}</span><p>{failed === "render" ? "This demo couldn’t start." : "This demo couldn’t load."}</p>
    {reloadNeeded
      ? <><p>Reloading restarts all sample demos on this page.</p><button className="button-text demo-retry" type="button" onClick={() => window.location.reload()}>Reload page</button></>
      : <button className="button-text demo-retry" type="button" onClick={retry}>Try again</button>}
  </div>;

  return <div ref={host} className={`homepage-demo homepage-demo-${kind}`} data-demo={kind} data-demo-state={failed ? "failed" : Demo ? "ready" : "pending"}>
    {Demo ? <DemoBoundary key={attempt} fallback={failure} onFailure={() => setFailed("render")}><Demo {...demoProps} active={visible && pageVisible} /></DemoBoundary>
      : failed ? failure : <div className="homepage-demo-placeholder" aria-busy={near || forceLoad}>
        <span className="eyebrow">{label}</span><span className="demo-loading-mark" aria-hidden="true">PT</span>
        <p>{near || forceLoad ? "Preparing the interactive demo…" : "Explore the interactive demo below."}</p>
      </div>}
  </div>;
}
