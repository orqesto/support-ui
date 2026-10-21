import type { CustomApiEndpoint } from '@/services/customApi.service';
import type { EndpointInitial } from './endpointWizardProps';
import { NoMatchHintField, useNoMatchHint } from './NoMatchHintField';
import { ReferenceNameField } from './ReferenceNameField';
import { useReferenceName } from './useReferenceName';

/**
 * The words agents read about a lookup that the ADMIN writes: the reference name (D4) and, since
 * 2026-10-21, what to tell the agent when nothing is found. One hook and one block so the wizard
 * (at its line ceiling) carries both with a single payload spread.
 */
export const useAgentWords = (
  endpoint: CustomApiEndpoint | undefined,
  initial: EndpointInitial | undefined,
  paramSource: string
) => {
  const reference = useReferenceName(endpoint, initial, paramSource);
  const noMatchHint = useNoMatchHint(endpoint, initial);
  return { reference, noMatchHint, payload: { ...reference.payload, ...noMatchHint.payload } };
};

export type AgentWords = ReturnType<typeof useAgentWords>;

/**
 * ⛔ The hint appears once the lookup EXISTS (an edit, or after the first Test) — the same "later
 * step" rule as roles and formats: a new lookup starts with a name, an address and nothing else.
 * Hidden, its box is blank, so a new lookup is created with no hint (null) and loses nothing.
 */
export const AgentWordsFields = ({ words, saved }: { words: AgentWords; saved: boolean }) => (
  <>
    <ReferenceNameField reference={words.reference} />
    {saved && <NoMatchHintField hint={words.noMatchHint} />}
  </>
);
