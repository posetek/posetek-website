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
 * Social identity is the athlete's own login on the server (Parent accounts decision, 2026-11-14),
 * so a parent session never calls the social endpoints. The player view offers no social surface
 * to a parent; `parentSession` makes this boundary refuse any call that slips through.
 */
export function createSocialApi(transport: SocialTransport, parentSession: () => boolean = () => false): SocialApi {
  return async <Name extends SocialCallableName>(name: Name, data: SocialRequests[Name]) => {
    const viewer = data as { viewAsPlayerId?: string; id?: string };
    const mutation = mutationNames.has(name) || (name === "moderateSocialActivity" && !!viewer.id);
    // Defense in depth for new consumers. The recovered backend also enforces
    // this rule; removing disabled buttons can never authorize an admin preview write.
    if (viewer.viewAsPlayerId && mutation) throw new Error("Athlete previews are read-only.");
    if (parentSession()) throw new Error("Organization activity is turned off.");
    const response = await transport.httpsCallable(name)(data);
    return response.data as SocialResponses[Name];
  };
}

export const callSocial = createSocialApi(cloud, () => actingPlayerId(auth.currentUser?.uid) !== null);
