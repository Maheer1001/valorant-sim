/**
 * Shape of a future experience record. Milestone 1 does not write or update these.
 */
export const LEARNING_RECORD_VERSION = 1;

export type LearningRecord = {
  version: typeof LEARNING_RECORD_VERSION;
  key: {
    agentDefinitionId: string;
    sequenceId: string;
    mapId: string;
    side: "attack" | "defense";
    economyBand: string;
    ownCompositionId: string;
    opposingCompositionId: string;
  };
  sampleSize: number;
  recencyWeight: number;
  uncertainty: { low: number; high: number };
};
