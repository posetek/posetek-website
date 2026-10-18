import { useSyncExternalStore } from "react";
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

export function useMarketingActivity(): boolean {
  return useSyncExternalStore(subscribeMarketingActivity, marketingActivityAllowed, serverSnapshot);
}
