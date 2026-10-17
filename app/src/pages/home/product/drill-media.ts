export type DemoDrillId = "DRB-006" | "PAS-001";
export type DrillMediaAsset = { name: string; video: string; poster: string };

/** Public website derivatives of the approved catalog assets; see media/provenance.json. */
export const drillMedia: Record<DemoDrillId, DrillMediaAsset> = {
  "DRB-006": {
    name: "Figure-8 dribble",
    video: figure8Video,
    poster: figure8Poster,
  },
  "PAS-001": {
    name: "Wall pass rhythm",
    video: wallPassVideo,
    poster: wallPassPoster,
  },
};
import figure8Video from "./media/figure-8.mp4?url";
import figure8Poster from "./media/figure-8.jpg?url";
import wallPassVideo from "./media/wall-pass.mp4?url";
import wallPassPoster from "./media/wall-pass.jpg?url";
