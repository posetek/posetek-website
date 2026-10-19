// Generated from editable SVG compositions by scripts/generate-showcase-artwork.mjs.
// Artwork is illustrative; visible UI must retain the qualifier beside each preview.
import artwork0 from "./showcase-assets/players-testing.webp?url";
import artwork0Small from "./showcase-assets/players-testing-600.webp?url";
import artwork1 from "./showcase-assets/players-profile.webp?url";
import artwork1Small from "./showcase-assets/players-profile-600.webp?url";
import artwork2 from "./showcase-assets/players-training.webp?url";
import artwork2Small from "./showcase-assets/players-training-600.webp?url";
import artwork3 from "./showcase-assets/players-coach.webp?url";
import artwork3Small from "./showcase-assets/players-coach-600.webp?url";
import artwork4 from "./showcase-assets/players-technique.webp?url";
import artwork4Small from "./showcase-assets/players-technique-600.webp?url";
import artwork5 from "./showcase-assets/players-mobile.webp?url";
import artwork5Small from "./showcase-assets/players-mobile-600.webp?url";
import artwork6 from "./showcase-assets/coaches-club.webp?url";
import artwork6Small from "./showcase-assets/coaches-club-600.webp?url";
import artwork7 from "./showcase-assets/coaches-evidence.webp?url";
import artwork7Small from "./showcase-assets/coaches-evidence-600.webp?url";
import artwork8 from "./showcase-assets/coaches-development.webp?url";
import artwork8Small from "./showcase-assets/coaches-development-600.webp?url";
import artwork9 from "./showcase-assets/coaches-contact.webp?url";
import artwork9Small from "./showcase-assets/coaches-contact-600.webp?url";

export const showcaseArtwork = {
  "players-testing": {
    title: "Recorded movement review",
    alt: "Three enlarged static frames from PoseTek’s approved recorded sprint, arranged as a movement study.",
    qualifier: "Recorded movement · Existing public sample",
    width: 1200, height: 900,
    src: artwork0, srcSmall: artwork0Small
  },
  "players-profile": {
    title: "Athlete profile",
    alt: "Alex Johnson’s existing sample skill map, with the five illustrative sample scores and an emphasis on agility.",
    qualifier: "Sample athlete profile",
    width: 1200, height: 900,
    src: artwork1, srcSmall: artwork1Small
  },
  "players-training": {
    title: "Training that follows the evidence",
    alt: "An original training composition pairing the approved Figure-8 dribble poster with its existing two-cone route.",
    qualifier: "Sample workout · Coaching illustration",
    width: 1200, height: 900,
    src: artwork2, srcSmall: artwork2Small
  },
  "players-coach": {
    title: "AI Coach and retesting",
    alt: "The existing four-assessment sample dribbling trend, from 6.62 to 6.18 seconds, paired with the sample coaching question.",
    qualifier: "Sample AI Coach conversation",
    width: 1200, height: 900,
    src: artwork3, srcSmall: artwork3Small
  },
  "players-technique": {
    title: "Technique at the same moment",
    alt: "Two saved phases from the approved recorded kick: backswing and contact, with the original contact knee measurement.",
    qualifier: "Recorded technique · Saved phase measurement",
    width: 1200, height: 900,
    src: artwork4, srcSmall: artwork4Small
  },
  "players-mobile": {
    title: "Your next session in your pocket",
    alt: "A bespoke PoseTek phone illustration featuring the existing Figure-8 drill route and its three sample sets.",
    qualifier: "Illustrative mobile workout preview",
    width: 1200, height: 900,
    src: artwork5, srcSmall: artwork5Small
  },
  "coaches-club": {
    title: "One club, every team",
    alt: "Northfield FC’s existing three illustrative age groups, connected to individual player focus on an editorial pitch diagram.",
    qualifier: "Illustrative club workspace",
    width: 1200, height: 900,
    src: artwork6, srcSmall: artwork6Small
  },
  "coaches-evidence": {
    title: "Individual player evidence",
    alt: "The existing Alex Rivera sample profile and its five illustrative sample scores, presented as a large radar and player-number study.",
    qualifier: "Illustrative player profile · Scores / 100",
    width: 1200, height: 900,
    src: artwork7, srcSmall: artwork7Small
  },
  "coaches-development": {
    title: "Plan, train, retest",
    alt: "An editorial sequence connects the existing Figure-8 coaching route with Alex Rivera’s illustrative 7.12 and 6.94 second retest values.",
    qualifier: "Illustrative development example",
    width: 1200, height: 900,
    src: artwork8, srcSmall: artwork8Small
  },
  "coaches-contact": {
    title: "A next step for your club",
    alt: "PoseTek’s approved P mark and existing team-enquiry message in a clean original invitation composition.",
    qualifier: "PoseTek team enquiry",
    width: 1200, height: 900,
    src: artwork9, srcSmall: artwork9Small
  }
} as const;

export type ShowcaseArtworkId = keyof typeof showcaseArtwork;
export type ShowcaseArtwork = (typeof showcaseArtwork)[ShowcaseArtworkId];
