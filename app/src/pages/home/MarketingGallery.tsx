import { useEffect, useRef, type ReactNode } from "react";
import { attachMarketingGalleryMotion } from "./marketing-gallery";

/** Children retain native DOM order and remain mounted at every viewport size. */
export function MarketingGallery({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => host.current ? attachMarketingGalleryMotion(host.current) : undefined, []);
  return <div className="marketing-gallery shell" ref={host} data-gallery-motion="static" style={{ overflowAnchor: "none" }}>{children}<span data-gallery-gap aria-hidden="true" style={{ position: "absolute", width: 0, height: "var(--gallery-gap, 80px)", visibility: "hidden", pointerEvents: "none" }} /></div>;
}
