export const BROWSER_CLIENT_KINDS = ['desktop_web', 'mobile_web', 'unknown_web'] as const;
export type BrowserClientKind = typeof BROWSER_CLIENT_KINDS[number];

type BrowserEvidence = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>
  & { userAgentData?: { mobile?: boolean } };

// Classify locally. Browser capabilities and user agent strings never enter telemetry.
export function browserClientKind(browser: BrowserEvidence): BrowserClientKind {
  const { userAgent, platform, maxTouchPoints, userAgentData } = browser;
  if (userAgentData?.mobile || /Android|iPhone|iPad|iPod|Windows Phone|Mobile|Tablet/i.test(userAgent)) return 'mobile_web';
  // iPadOS may request desktop sites with this same Macintosh user agent.
  if (platform === 'MacIntel' && maxTouchPoints > 1 && /Macintosh/i.test(userAgent)) return 'mobile_web';
  if (/Windows NT|Macintosh|CrOS/i.test(userAgent)) return 'desktop_web';
  // A Linux desktop user agent plus touch can also be Android in desktop-site mode.
  if (/X11|Linux (?:x86_64|i[36]86)/i.test(userAgent) && maxTouchPoints === 0) return 'desktop_web';
  return 'unknown_web';
}

export function focusedPage() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

export function videoProgress() {
  const positions = new WeakMap<HTMLVideoElement, number>();
  return () => {
    let progressing = false;
    for (const video of document.querySelectorAll('video')) {
      const prior = positions.get(video);
      positions.set(video, video.currentTime);
      const rect = video.getBoundingClientRect();
      if (!video.paused && !video.ended && !video.seeking && prior !== undefined && video.currentTime > prior && video.currentTime - prior < 2
        && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth) progressing = true;
    }
    return progressing;
  };
}

export function browserEngagementEnvironment(currentUid: () => string | undefined) {
  return {
    wall: Date.now,
    mono: () => performance.now(),
    currentUid,
    online: () => navigator.onLine,
    visible: focusedPage,
    progressingVideo: videoProgress(),
    on(name: string, listener: (event: { isTrusted?: boolean; detail?: { active?: boolean } }) => void) {
      const callback = (event: Event) => {
        // Control focus changes do not mean the browser window lost foreground.
        if ((name === 'blur' || name === 'focus') && event.target !== window) return;
        listener({ isTrusted: event.isTrusted, detail: (event as CustomEvent).detail });
      };
      const target = name === 'visibilitychange' ? document : window;
      target.addEventListener(name, callback, { passive: true, capture: true });
      return () => target.removeEventListener(name, callback, true);
    },
    every(milliseconds: number, action: () => void) {
      const id = setInterval(action, milliseconds);
      return () => clearInterval(id);
    },
  };
}
