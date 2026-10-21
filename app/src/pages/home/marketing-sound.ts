/** Original, quiet interface cues. No audio or context exists before opt-in. */
const STORAGE_KEY = "posetek.marketing.sound";
let enabled = false;
let initialized = false;
let context: AudioContext | undefined;
const listeners = new Set<() => void>();
type Cue = "open" | "close" | "action" | "enable";

export function initializeMarketingSound(): boolean {
  if (initialized) return enabled;
  initialized = true;
  try { enabled = window.sessionStorage.getItem(STORAGE_KEY) === "on"; }
  catch { enabled = false; }
  return enabled;
}

export function subscribeMarketingSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setMarketingSoundEnabled(value: boolean): void {
  initialized = true;
  enabled = value;
  try { window.sessionStorage.setItem(STORAGE_KEY, value ? "on" : "off"); }
  catch { /* Private/storage-restricted browsers can still opt in for this page. */ }
  listeners.forEach(listener => listener());
  if (!enabled && context?.state === "running") void context.suspend().catch(() => {});
}

export function playMarketingSound(cue: Cue = "action"): void {
  if (!enabled || typeof window === "undefined" || document.hidden) return;
  try {
    if (!context) {
      const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      context = new Audio();
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && context?.state === "running") void context.suspend().catch(() => {});
      });
    }
    const audio = context;
    const emit = () => {
      if (!enabled || document.hidden || audio.state !== "running") return;
      const oscillator = audio.createOscillator();
      const volume = audio.createGain();
      const time = audio.currentTime;
      const frequency = { open: 580, close: 390, action: 720, enable: 880 }[cue];
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, time);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.18, time + .055);
      volume.gain.setValueAtTime(0, time);
      volume.gain.linearRampToValueAtTime(.025, time + .008);
      volume.gain.exponentialRampToValueAtTime(.0001, time + .075);
      oscillator.connect(volume);
      volume.connect(audio.destination);
      oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
      oscillator.start(time);
      oscillator.stop(time + .085);
    };
    if (audio.state === "suspended") void audio.resume().then(emit).catch(() => {});
    else emit();
  } catch { /* Sound is optional and never blocks navigation. */ }
}
