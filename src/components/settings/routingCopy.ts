import type { AiRefusal } from '@/types/skillRouting';

/** Why an AI routing helper could not answer — shown, never thrown. */
export const aiRefusalText = (reason: AiRefusal): string =>
  reason === 'no_ai'
    ? 'No AI provider is configured for this workspace.'
    : reason === 'budget'
      ? 'The AI budget does not allow this right now.'
      : 'The AI could not answer. Try again later.';
