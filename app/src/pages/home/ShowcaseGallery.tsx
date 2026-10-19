import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { attachMarketingGalleryMotion } from "./marketing-gallery";
import { MarketingActivityContext } from "./marketing-activity";
import { DemoPanelContent } from "./DemoDisclosure";
import { showcaseArtwork, type ShowcaseArtworkId } from "./showcase-artwork";
import "./showcase-gallery.scss";

type OpenOptions = { focus?: boolean; scroll?: boolean; opener?: HTMLElement };
const ShowcaseContext = createContext({ active: null as string | null, enhanced: false, open: (_id: string, _options?: OpenOptions) => {}, close: (_id: string) => {} });

/** Stable native document slots: previews and retained panels never reparent. */
export function ShowcaseGallery({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState(false);
  const pending = useRef<{ id: string; focus: boolean; scroll: boolean } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((id: string, options: OpenOptions = {}) => {
    opener.current = options.opener ?? host.current?.querySelector<HTMLElement>(`[data-showcase-open="${id}"][data-showcase-primary]`) ?? null;
    pending.current = { id, focus: options.focus !== false, scroll: options.scroll !== false };
    setActive(id);
  }, []);
  const close = useCallback((id: string) => {
    pending.current = null;
    setActive(null);
    const button = opener.current?.isConnected ? opener.current : host.current?.querySelector<HTMLButtonElement>(`[data-showcase-open="${id}"][data-showcase-primary]`);
    button?.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      if (!button || !button.isConnected) return;
      const rect = button.getBoundingClientRect();
      if (rect.top < 110 || rect.bottom > innerHeight - 24) button.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }, []);

  useLayoutEffect(() => {
    const request = pending.current;
    if (!request || request.id !== active) return;
    pending.current = null;
    const panel = host.current?.querySelector<HTMLElement>(`[data-showcase-panel="${request.id}"]`);
    if (!panel) return;
    if (request.focus) panel.querySelector<HTMLElement>("[data-showcase-panel-title]")?.focus({ preventScroll: true });
    if (request.scroll) panel.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [active]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    setEnhanced(true);
    let disposed = false, detachMotion: (() => void) | undefined;
    // A failed decorative import never takes down the document or its demos.
    void import("./marketing-showcase-motion").then(module => {
      if (!disposed) detachMotion = module.attachMarketingShowcaseMotion(node);
    }).catch(() => { if (!disposed) node.dataset.showcaseMotion = "failed"; });
    let hashFrame = 0;
    const revealHash = (initial = false) => {
      cancelAnimationFrame(hashFrame);
      let id = "";
      try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      if (!id) return;
      const target = document.getElementById(id);
      const owner = target?.closest<HTMLElement>("[data-showcase-panel]") || Array.from(node.querySelectorAll<HTMLElement>("[data-showcase-panel]")).find(panel => panel.dataset.demoAnchors?.split(" ").includes(id));
      if (!owner) return;
      open(owner.dataset.showcasePanel!, { focus: false, scroll: false });
      if (!initial) return;
      hashFrame = requestAnimationFrame(() => {
        const destination = owner.dataset.demoAnchors?.split(" ").includes(id) ? owner : document.getElementById(id);
        destination?.scrollIntoView({ block: "start", behavior: "instant" });
      });
    };
    // A fragment navigation fires popstate before native scroll restoration.
    // Expose the real alias synchronously so the browser can land or restore
    // its reading offset against the correct panel height. Do not scroll here.
    const restoreHistory = () => { flushSync(() => revealHash()); };
    const hashChanged = () => { revealHash(); };
    revealHash(true);
    window.addEventListener("hashchange", hashChanged);
    window.addEventListener("popstate", restoreHistory);
    // Register the height stabilizer after owner restoration, so its history
    // snapshot measures the newly visible slot rather than a hidden zero box.
    const detachPosition = attachMarketingGalleryMotion(node);
    return () => { disposed = true; cancelAnimationFrame(hashFrame); detachPosition(); detachMotion?.(); window.removeEventListener("hashchange", hashChanged); window.removeEventListener("popstate", restoreHistory); };
  }, [open]);

  return <ShowcaseContext.Provider value={{ active, enhanced, open, close }}>
    <div ref={host} className="marketing-gallery showcase-gallery shell" data-showcase-gallery="" data-showcase-enhanced={enhanced || undefined} data-showcase-active={active || undefined} style={{ overflowAnchor: "none" }}>
      {children}
      <noscript><p className="showcase-no-script">The previews show PoseTek’s recorded and sample experiences. Enable JavaScript to explore the interactive demos.</p></noscript>
    </div>
  </ShowcaseContext.Provider>;
}

export function ShowcasePair({ children }: { children: ReactNode }) {
  return <div className="showcase-pair">{children}</div>;
}

type ChapterProps = {
  id: string; titleId: string; number: string; label: string; title: ReactNode; description: string;
  artwork: ShowcaseArtworkId; kind?: string; caption: string; children?: ReactNode;
  aliases?: string[]; demoAnchors?: string[]; requestToken?: number; footer?: ReactNode;
  action?: { href: string; label: string };
};

export function ShowcaseChapter({ id, titleId, number, label, title, description, artwork: artworkId, kind = id, caption, children, aliases = [], demoAnchors = [], requestToken = 0, footer, action }: ChapterProps) {
  const { active, enhanced, open, close } = useContext(ShowcaseContext);
  const expanded = active === id;
  const [mounted, setMounted] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const artwork = showcaseArtwork[artworkId];
  useEffect(() => { if (expanded) setMounted(true); }, [expanded]);
  useEffect(() => { if (requestToken > 0) open(id); }, [requestToken, id, open]);
  useEffect(() => {
    if (!expanded) panel.current?.querySelectorAll("video,audio").forEach(media => (media as HTMLMediaElement).pause());
    panel.current?.dispatchEvent(new Event("marketing-gallery-position", { bubbles: true }));
  }, [expanded]);
  const visual = <span className="showcase-frame" data-showcase-frame={id} data-gallery-media="">
    <img data-showcase-image="" src={artwork.src} srcSet={`${artwork.srcSmall} 600w, ${artwork.src} 1200w`} sizes="(min-width: 1024px) 46.25vw, calc(100vw - 32px)" alt={artwork.alt} width={1200} height={900} loading="lazy" decoding="async" />
    <span className="showcase-frame-hint" aria-hidden="true">[ {action ? action.label : "Explore demo"} ]</span>
  </span>;
  return <>
    <section id={id} className="showcase-chapter" data-showcase-chapter={id} aria-labelledby={titleId}>
      {aliases.map(alias => <span key={alias} id={alias} className="section-anchor" />)}
      {action ? <a className="showcase-preview" href={action.href} aria-label={action.label}>{visual}</a>
        : <button className="showcase-preview" type="button" disabled={!enhanced} data-showcase-open={id} aria-label={`Explore ${label.toLowerCase()} demo`} aria-controls={`demo-panel-${id}`} aria-expanded={expanded} onClick={event => expanded ? close(id) : open(id, { opener: event.currentTarget })}>{visual}</button>}
      <div className="showcase-caption">
        <div className="showcase-heading"><p className="eyebrow">{number} / {label}</p><h2 id={titleId} tabIndex={-1}>{title}</h2></div>
        <p className="showcase-description">{description}</p>
        <p className="showcase-provenance">{artwork.qualifier}</p>
        <p className="showcase-facts">{caption}</p>
        <div className="showcase-actions">{action ? <a className="showcase-action" href={action.href}><span>{action.label}</span><span aria-hidden="true">↗</span></a>
          : <button className="showcase-action" type="button" disabled={!enhanced} data-showcase-open={id} data-showcase-primary="" aria-controls={`demo-panel-${id}`} aria-expanded={expanded} onClick={event => expanded ? close(id) : open(id, { opener: event.currentTarget })}><span>{expanded ? "Close demo" : "Explore full demo"}</span><span aria-hidden="true">{expanded ? "−" : "+"}</span></button>}
        {!action && footer && <div className="showcase-footer">{footer}</div>}</div>
        {action && footer && <div className="showcase-footer">{footer}</div>}
      </div>
    </section>
    {!action && <div ref={panel} id={`demo-panel-${id}`} className="showcase-panel" data-showcase-panel={id} data-demo-anchors={demoAnchors.join(" ")} hidden={!expanded} inert={!expanded} role="region" aria-labelledby={`demo-heading-${id}`}>
      {demoAnchors.map(alias => <span key={alias} id={alias} className="section-anchor showcase-panel-anchor" data-showcase-demo-alias={id} />)}
      <div className="showcase-panel-header"><div><span className="eyebrow">{number} / Interactive demo</span><h3 id={`demo-heading-${id}`} data-showcase-panel-title="" tabIndex={-1}>{label}</h3></div><button type="button" data-showcase-close={id} onClick={() => close(id)}>Close demo <span aria-hidden="true">×</span></button></div>
      <MarketingActivityContext.Provider value={expanded}>
        <DemoPanelContent kind={kind} expanded={expanded}>{(mounted || expanded) && children}</DemoPanelContent>
      </MarketingActivityContext.Provider>
      <button className="showcase-panel-end" type="button" data-showcase-close={id} onClick={() => close(id)}>Close demo and continue <span aria-hidden="true">↑</span></button>
    </div>}
  </>;
}
