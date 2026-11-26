import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./PrivacyPage";
import { POLICY_CONTACT_EMAIL, POLICY_LAST_UPDATED, POLICY_SECTIONS, sectionNumber } from "./privacy-sections";

const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/privacy"]}><PrivacyPage /></MemoryRouter>);

describe("privacy policy page", () => {
  it("publishes no unresolved draft placeholders or drafting notes", () => {
    expect(html).not.toContain("[[");
    expect(html).not.toContain("]]");
    expect(html).not.toMatch(/OPTIONAL|CONFIRM|PLACEHOLDER|IMPLEMENTATION NOTES/);
  });

  it("renders every section once, in order, under a stable anchor", () => {
    expect(POLICY_SECTIONS).toHaveLength(14);
    expect(new Set(POLICY_SECTIONS.map(section => section.id)).size).toBe(POLICY_SECTIONS.length);
    const rendered = [...html.matchAll(/<section id="([^"]+)"/g)].map(match => match[1]);
    expect(rendered).toEqual(POLICY_SECTIONS.map(section => section.id));
  });

  it("links every table-of-contents entry and in-text reference to a section on the page", () => {
    const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
    expect(anchors.slice(0, POLICY_SECTIONS.length)).toEqual(POLICY_SECTIONS.map(section => section.id));
    for (const anchor of anchors) expect(html).toContain(`<section id="${anchor}"`);
  });

  it("numbers the children's privacy cross-reference from the section list", () => {
    expect(sectionNumber("how-we-share-information")).toBe(6);
    expect(html).toContain('<a href="#how-we-share-information">Section 6</a>');
  });

  it("keeps the first-party usage measurement disclosure the Insights release relies on", () => {
    expect(html).toContain("estimated active time and feature categories");
    expect(html).toContain("selected buttons");
    expect(html).toContain("Detailed named journeys expire after 90 days");
    expect(html).toContain("phone or tablet browsers");
    expect(html).toContain("do not contain page addresses, typed text, or screen recordings");
    expect(html).toContain("Detailed active-use records are retained for 90 days and daily usage summaries for 24 months");
  });

  it("discloses prospective account attribution, anonymous shared visits and unchanged historical anonymity", () => {
    expect(POLICY_LAST_UPDATED).toBe("November 26, 2026");
    const section = html.match(/<section id="app-feedback"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(section).toContain("before you answer");
    expect(section).toContain("requires a signed-in account");
    expect(section).toContain("anonymous feedback when signed out");
    expect(section).toContain("account ID, account name and email address when available");
    expect(section).toContain("PoseTek administrators can see this account information with the response");
    expect(section).toContain("not a verified real-world person");
    expect(section).toContain("earlier anonymous form remain anonymous");
    expect(section).toContain("not linked retrospectively");
    expect(section).toContain("New anonymous responses contain no account author information");
    expect(section).toContain("diagnostic records do not store the submitting account");
    expect(section).toContain("expire after 90 days");
  });

  it("preserves the under-13 consent protections and limits on making children's information public", () => {
    expect(html).toContain("without verifiable consent from a parent or legal guardian");
    expect(html).toContain("do not make children&#x27;s information publicly available");
    expect(html).toContain("withdraw consent previously given");
    expect(html).toContain("no public profiles");
    expect(html).toContain("before the changes take effect");
  });

  it("routes every privacy request to the published contact address", () => {
    expect(POLICY_CONTACT_EMAIL).toBe("nolanj@posetek.net");
    const mailtos = [...html.matchAll(/href="mailto:([^"]+)"/g)].map(match => match[1]);
    expect(mailtos.length).toBeGreaterThanOrEqual(6);
    expect(new Set(mailtos)).toEqual(new Set([POLICY_CONTACT_EMAIL]));
  });
  it("explains native provider permission, withdrawal limits and separate media choices", () => {
    const ai = html.match(/<section id="ai-and-automated-processing"[\s\S]*?<\/section>/)?.[0] ?? "";
    for (const text of ["Google Vertex AI", "Anthropic", "TypeSafe (Jev)", "OpenAI", "Account settings → AI sharing",
      "microphone and speech-recognition", "recording remains available", "another account or device",
      "requests already sent may finish", "does not delete existing conversations", "asks you to retry",
      "athlete or guardian authority"]) expect(ai).toContain(text);
    const data = html.match(/<section id="information-we-collect"[\s\S]*?<\/section>/)?.[0] ?? "";
    for (const text of ["off by default", "that account and athlete on that device", "Coaches cannot grant",
      "including queued media", "already started may finish", "Diagnostic logs still send", "Local recovery files may remain"])
      expect(data).toContain(text);
  });

  it("preserves approved retention and distinguishes team removal from deletion", () => {
    expect(html).toContain("within 30 days");
    expect(html).toContain("up to 90 days");
    expect(html).toContain("Removing a player from a team keeps their account and recordings; it is not account deletion");
    expect(html).toContain("deletion receipt on the sign-in screen");
  });

  it("describes the App Store submission's deletion route, scope and timing", () => {
    const choices = html.match(/<section id="your-choices-and-rights"[\s\S]*?<\/section>/)?.[0] ?? "";
    for (const text of ["Account menu (the initials button) → Account settings → Delete account", "recordings and training videos",
      "workout logs", "AI conversations, reports and AI coach memories, and your AI-sharing permission",
      "community feed activity, comments, kudos and connections", "about a day after you confirm",
      "always within 30 days", "statistics that can no longer be linked to you may remain",
      "requests by email remain available"]) expect(choices).toContain(text);
    expect(html).toContain("final cleanup pass runs about 24 hours later");
    const children = html.match(/<section id="childrens-privacy"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(children).toContain("request deletion of their child&#x27;s account");
  });

  it("names the AI providers, the permission gate and the guidance-only limit", () => {
    const ai = html.match(/<section id="ai-and-automated-processing"[\s\S]*?<\/section>/)?.[0] ?? "";
    for (const text of ["Google Vertex AI (Gemini models)", "Anthropic (Claude models)", "TypeSafe (Jev), for routing voice requests",
      "voice assistance", "the app&#x27;s AI features stay off", "withdraw at any time",
      "Content generated by AI", "not medical advice"]) expect(ai).toContain(text);
  });

  it("limits AI sharing to the owner's profile including staff and guardian accounts", () => {
    const ai = html.match(/<section id="ai-and-automated-processing"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(ai).toContain("your own athlete profile only");
    expect(ai).toContain("temporarily unavailable to coaches, club administrators, PoseTek staff and linked parents or guardians");
    expect(ai).toContain("ordinary authorized access to saved workouts and results remains available");
    expect(html).not.toContain("with their own AI-sharing permission");
  });

  it("discloses voice mode, camera uses and the community feed", () => {
    const data = html.match(/<section id="information-we-collect"[\s\S]*?<\/section>/)?.[0] ?? "";
    for (const text of ["Speech recognition runs on your iPhone", "not an audio recording", "Warm-up tracking",
      "Watch mode", "do not save or upload video", "Save video to cloud"]) expect(data).toContain(text);
    const sharing = html.match(/<section id="how-we-share-information"[\s\S]*?<\/section>/)?.[0] ?? "";
    for (const text of ["community feed is off unless", "teammates, coaches and staff",
      "shared automatically with the player&#x27;s organization", "PoseTek administrators, who can also hide any activity"])
      expect(sharing).toContain(text);
  });

  it("discloses training reminder notifications, the device token, Apple's delivery and how to turn them off", () => {
    const data = html.match(/<section id="information-we-collect"[\s\S]*?<\/section>/)?.[0] ?? "";
    for (const text of ["<strong>Notifications:</strong>", "asks once for permission to send notifications",
      "through Apple&#x27;s push notification service", "push notification token for your iPhone",
      "linked to the signed-in account and the player", "when the player recently finished training",
      "receives that player&#x27;s reminders on their own phone", "contain no messages written by users",
      "Turning notifications off for PoseTek in iOS Settings stops the reminders"]) expect(data).toContain(text);
    const sharing = html.match(/<section id="how-we-share-information"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(sharing).toContain("Apple, through its push notification service, for delivering training reminders");
    const retention = html.match(/<section id="data-retention"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(retention).toContain("push notification token is deleted when the account is deleted");
    expect(retention).toContain("when another account registers for notifications on that device");
    const choices = html.match(/<section id="your-choices-and-rights"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(choices).toContain("photo library and notification access in your device settings");
    expect(choices).toContain("training reminders stop when notifications are off");
    const children = html.match(/<section id="childrens-privacy"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(children).toContain("a device token used to deliver training reminders");
  });

});
