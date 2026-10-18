import { useEffect, useRef, type ReactNode } from "react";
import { attachMarketingGalleryMotion } from "./marketing-gallery";

/** Children retain native DOM order and remain mounted at every viewport size. */
export function MarketingGallery({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => host.current ? attachMarketingGalleryMotion(host.current) : undefined, []);
  return <div className="marketing-gallery shell" ref={host} data-gallery-motion="static" data-gallery-layout="editorial" style={{ overflowAnchor: "none" }}>{children}</div>;
}
