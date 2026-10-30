/**
 * KB engine types, local copy for the page mock (F0). The real contract is
 * src/services/kbEngine.types.ts (F2); F7 deletes this folder.
 */

export type KbQuestionEvidence = {
  threads: number;
  customers: number;
  countries: string[];
  /** ISO dates (YYYY-MM-DD): first and last time this answer was seen. */
  firstSeen: string;
  lastSeen: string;
  usedInDraftsThisWeek: number;
};

export type KbQuestionChoice = {
  /** Stable key of the choice (the answer is recorded against it). */
  key: string;
  /** The answer in plain words. */
  text: string;
  evidence: KbQuestionEvidence;
};

export type KbQuestion = {
  id: string;
  /** The question in plain words. */
  question: string;
  choices: [KbQuestionChoice, KbQuestionChoice];
  /** What the engine already checked and ruled out. */
  ruledOut: string[];
  /** Pre-filled guess for "depends on …", if the engine has one. */
  guess?: string;
  /** Question has been open this many days. */
  openDays: number;
};
