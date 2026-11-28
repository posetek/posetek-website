type Action = "open" | "team" | "standings-test" | "one-pager" | "notes" | "messages" | "recipient" | "group" | "send-one" | "send-all";

export const usageEnabled = import.meta.env.VITE_COACH_NOTES !== "demo" && import.meta.env.VITE_COACH_DEMO_USAGE === "1";
type RecordAction = (action: Action, team: number) => void;

export async function createUsage(key: string): Promise<RecordAction> {
  if (!usageEnabled || navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) {
    return () => {};
  }
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("coach-usage-v1:" + key));
  const proof = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
  const visit = crypto.randomUUID();
  let sequence = 0;
  return (action, team) => {
    if (++sequence > 500) return;
    void fetch("/.netlify/functions/coach-usage", {
      method: "POST", credentials: "omit", referrerPolicy: "no-referrer", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof, visit, seq: sequence, action, team }),
    }).catch(() => {});
  };
}

export function clickedAction(el: Element): Action | undefined {
  if (el.closest(".cv-roster-scroll > details:not([open]) > summary")) return "one-pager";
  if (el.closest(".cv-notes:not([open]) > summary")) return "notes";
  if (el.closest(".cv-recipients button")) return "recipient";
  if (el.closest(".cv-attention .cv-group")) return "group";
  if (el.closest(".portal-header .cv-group")) return "messages";
  if (el.closest("button.cv-send:enabled")) {
    return el.closest(".cv-attention")?.querySelector('.cv-group[aria-pressed="true"]') ? "send-all" : "send-one";
  }
}
