/**
 * The three thresholds of the guided AI draft's check of the agent's own text
 * (`ai.agent_note_facts`): its own file because platformSettings.service.ts is at its size limit.
 * Imports nothing, so the service can import it without a cycle.
 */
export const AGENT_NOTE_FACTS_FIELDS = [
  'minDigits',
  'minJoinedLength',
  'maxRequiredFactsChars',
] as const;
export type AgentNoteFactsField = (typeof AGENT_NOTE_FACTS_FIELDS)[number];
