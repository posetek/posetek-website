// Where the rep tools read and write. Tests and the DEV preview pass synthetic loaders.

import { loadPlayer } from "./accounts";
import type { PlayerRow } from "./accounts";
import { loadRep, loadRepArtifacts, loadRepRevisions, pushRepRevision, restoreRepRevision } from "./repToolsData";

export interface RepToolsSource {
  loadRep: typeof loadRep;
  loadRepArtifacts: typeof loadRepArtifacts;
  loadRepRevisions: typeof loadRepRevisions;
  loadPlayer: (playerId: string) => Promise<PlayerRow | null>;
  pushRepRevision: typeof pushRepRevision;
  restoreRepRevision: typeof restoreRepRevision;
}

export const LIVE_REP_TOOLS_SOURCE: RepToolsSource = { loadRep, loadRepArtifacts, loadRepRevisions, loadPlayer, pushRepRevision, restoreRepRevision };
