import { auth, cloud } from "../../lib/firebase";
import { actingPlayerId } from "../../lib/acting-player";
import type { SocialApi, SocialCallableName, SocialRequests, SocialResponses } from "./contracts";

/** Narrow transport boundary lets web and app clients share contracts, and tests
 * exercise the exact callable payloads without creating Firebase data.
 */
export interface SocialTransport {
  httpsCallable(name: string): (data: unknown) => Promise<{ data: unknown }>;
}

const mutationNames = new Set<SocialCallableName>([
  "setSocialKudos", "saveSocialComment", "setSocialVisibility", "socialConnection",
  "saveSocialPreferences", "reportSocialActivity",
]);

/**
 * Endpoints that name the acting child in a parent session (Parent accounts plan §11.3). Not
 * `getSocialPeople` or `socialConnection`, whose `playerId` already names the other athlete, and
 * not the administrator-only directory and moderation calls.
 */
export const ACTING_PLAYER_SOCIAL_CALLS = new Set<SocialCallableName>([
  "getSocialContext", "getSocialFeed", "getSocialActivity", "getSocialComments", "getSocialMedia",
  "setSocialKudos", "saveSocialComment", "setSocialVisibility", "saveSocialPreferences", "reportSocialActivity",
]);

/** `acting` returns the child a parent login is viewing, or null; owners send exactly what they sent. */
export function createSocialApi(transport: SocialTransport, acting: () => string | null = () => null): SocialApi {
  return async <Name extends SocialCallableName>(name: Name, data: SocialRequests[Name]) => {
    const viewer = data as { viewAsPlayerId?: string; id?: string; playerId?: string };
    const mutation = mutationNames.has(name) || (name === "moderateSocialActivity" && !!viewer.id);
    // Defense in depth for new consumers. The recovered backend also enforces
    // this rule; removing disabled buttons can never authorize an admin preview write.
    if (viewer.viewAsPlayerId && mutation) throw new Error("Athlete previews are read-only.");
    const playerId = ACTING_PLAYER_SOCIAL_CALLS.has(name) && !viewer.viewAsPlayerId && viewer.playerId === undefined ? acting() : null;
    const response = await transport.httpsCallable(name)(playerId ? { ...data, playerId } : data);
    return response.data as SocialResponses[Name];
  };
}

export const callSocial = createSocialApi(cloud, () => actingPlayerId(auth.currentUser?.uid));
