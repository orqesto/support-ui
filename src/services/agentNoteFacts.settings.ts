import type { BoundedField } from './resolvedField';

/**
 * The guided AI draft's check of the agent's own text (`ai.agent_note_facts`): its three
 * thresholds, their shapes as GET answers and PUT takes them. The reader (`readAgentNoteFacts`)
 * stays in platformSettings.service.ts beside the bounded-field readers it uses.
 */
export const AGENT_NOTE_FACTS_FIELDS = [
  'minDigits',
  'minJoinedLength',
  'maxRequiredFactsChars',
] as const;
export type AgentNoteFactsField = (typeof AGENT_NOTE_FACTS_FIELDS)[number];
/** GET `drafts.agentNoteFacts`: each threshold with its source and bounds. */
export type AgentNoteFactsSettings = Record<AgentNoteFactsField, BoundedField>;
/** PUT `agentNoteFacts`: any non-empty subset; the server merges it over the saved thresholds. */
export type AgentNoteFactsInput = Partial<Record<AgentNoteFactsField, number>>;
