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
import artwork4 from "./showcase-assets/players-mobile.webp?url";
import artwork4Small from "./showcase-assets/players-mobile-600.webp?url";
import artwork5 from "./showcase-assets/coaches-club.webp?url";
import artwork5Small from "./showcase-assets/coaches-club-600.webp?url";
import artwork6 from "./showcase-assets/coaches-evidence.webp?url";
import artwork6Small from "./showcase-assets/coaches-evidence-600.webp?url";
import artwork7 from "./showcase-assets/coaches-development.webp?url";
import artwork7Small from "./showcase-assets/coaches-development-600.webp?url";
import artwork8 from "./showcase-assets/coaches-contact.webp?url";
import artwork8Small from "./showcase-assets/coaches-contact-600.webp?url";

export const showcaseArtwork = {
  "players-testing": {
    title: "Soccer testing, rep by rep",
    alt: "Three frames from a recorded sprint test. This rep reached a top speed of 12.5 mph.",
    qualifier: "Recorded movement · Public sprint sample",
    width: 1200, height: 900,
    src: artwork0, srcSmall: artwork0Small
  },
  "players-profile": {
    title: "Your development pathway",
    alt: "Alex’s best left dribble is 3.24 m/s. The fictional U17 club average is 3.28 m/s. The curve shows club results across U11 to U17.",
    qualifier: "Fictional player and club results",
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
  "players-mobile": {
    title: "Your next session in your pocket",
    alt: "A bespoke PoseTek phone illustration featuring the existing Figure-8 drill route and its three sample sets.",
    qualifier: "Illustrative mobile workout preview",
    width: 1200, height: 900,
    src: artwork4, srcSmall: artwork4Small
  },
  "coaches-club": {
    title: "Left-dribble pathway",
    alt: "The sample U13 team averages 7.00 s. The points show each club age group’s average on the same left dribble.",
    qualifier: "Fictional team and club results",
    width: 1200, height: 900,
    src: artwork5, srcSmall: artwork5Small
  },
  "coaches-evidence": {
    title: "Sam’s practice focus",
    alt: "Sam Bennett’s assigned Figure-8 dribble drill. A looping route goes around two cones. Take one short touch as you leave each cone.",
    qualifier: "Sample player · Illustrated drill",
    width: 1200, height: 900,
    src: artwork6, srcSmall: artwork6Small
  },
  "coaches-development": {
    title: "Training between tests",
    alt: "A close view of the public Figure-8 demonstration. Sam Bennett logged 12 minutes of workout time during Oct 1–14 in this fictional example.",
    qualifier: "Public drill photo · Fictional workout time",
    width: 1200, height: 900,
    src: artwork7, srcSmall: artwork7Small
  },
  "coaches-contact": {
    title: "Bring testing to your field",
    alt: "A faceted PoseTek soccer ball at the halfway line of a lime-green pitch.",
    qualifier: "Illustrated field setup",
    width: 1200, height: 900,
    src: artwork8, srcSmall: artwork8Small
  }
} as const;

export type ShowcaseArtworkId = keyof typeof showcaseArtwork;
export type ShowcaseArtwork = (typeof showcaseArtwork)[ShowcaseArtworkId];
