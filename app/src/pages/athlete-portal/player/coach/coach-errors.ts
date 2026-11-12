/**
 * What the Coach tab tells the athlete when a turn fails, word for word from the app's
 * `LLMError.userMessage` (KickAI/LLM/LLMError.swift). The app decides by the gateway's error code,
 * never by the gateway's message, which is written for a log. A failure without a code (a dropped
 * connection, a local refusal) reads as the app's internal error.
 */
export type CoachFailure = { code?: string; requestId?: string };

/** `LLMCapability.poseChat.displayName`, used in the daily-limit message. */
const FEATURE = 'Technique Q&A';

/** The next 00:00 UTC (the gateway's daily reset), as a short local time. */
export function quotaResetTime(now = new Date(), locale?: string, timeZone?: string): string {
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(reset);
}

export function coachErrorMessage(code: string | undefined, now = new Date()): string {
  switch (code) {
    case 'ai_consent_required': return 'AI sharing is off. Turn it on in Account settings to use this feature.';
    case 'ai_athlete_consent_required': return 'AI for another athlete is unavailable until athlete or guardian permission can be verified.';
    case 'unauthenticated': return 'Your session expired. Sign in again to continue.';
    case 'app_check_failed': return "Device verification failed. Check your connection and this build's App Check setup before trying again.";
    case 'permission_denied': return "You don't have access to this athlete's data.";
    case 'capability_disabled': return 'This feature is temporarily unavailable.';
    case 'quota_exceeded': return `You've reached today's limit for ${FEATURE}. It resets at ${quotaResetTime(now)} your time.`;
    case 'invalid_request': return 'Something was wrong with that request. Use Report this to tell us what happened.';
    case 'client_too_old': return 'This feature needs a newer version of the app.';
    case 'context_unavailable': return "There isn't enough recorded data yet to work from. Record a few more reps first.";
    case 'validation_failed': return "That didn't come out as a usable result, so we didn't show it. Try again.";
    case 'provider_error': return 'The coaching model is unavailable right now. Try again shortly.';
    default: return 'Something went wrong. Try again shortly.';
  }
}

/** The eight characters an athlete can quote (`LLMError.refCode`). */
export function coachRefCode(requestId: unknown): string {
  return typeof requestId === 'string' && requestId ? requestId.slice(0, 8) : '';
}
