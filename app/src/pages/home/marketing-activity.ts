import { createContext, useContext, useSyncExternalStore } from "react";
import { navigationIsClosed, subscribeNavigation } from "./marketing-renderer/protocol";

/** Read the eager navigation owner's state; consumers never own its phase. */
export function marketingActivityAllowed(): boolean {
  return !document.hidden && navigationIsClosed();
}

export function subscribeMarketingActivity(listener: () => void): () => void {
  const unsubscribeNavigation = subscribeNavigation(listener);
  document.addEventListener("visibilitychange", listener);
  return () => {
    unsubscribeNavigation();
    document.removeEventListener("visibilitychange", listener);
  };
}

const serverSnapshot = () => false;
export const MarketingActivityContext = createContext(true);

export function useMarketingActivity(): boolean {
  const localActivity = useContext(MarketingActivityContext);
  return useSyncExternalStore(subscribeMarketingActivity, marketingActivityAllowed, serverSnapshot) && localActivity;
}
