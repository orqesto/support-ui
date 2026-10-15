import { useState } from 'react';
import type { CustomApiEndpoint } from '@/services/customApi.service';
import type { EndpointInitial } from './endpointWizardProps';

/**
 * D4 (2026-10-14): what agents call the value a typed-value lookup takes ("Ticket id", "Tracking
 * number"…). It becomes the agent field's placeholder and the not-found sentence. A template
 * pre-fills it on a NEW lookup (copied once, like the status words); an existing lookup keeps its
 * own.
 *
 * ⛔ `payload` is EMPTY for a lookup that takes no typed value — omitted means "leave what is
 * stored" in this API, so flipping the parameter source never erases a name the admin set. For a
 * typed-value lookup it is always sent, and blank clears it (null).
 *
 * ⚠️ A backend before 2026-10-14 does not know the key and drops it (its endpoint schemas strip
 * unknown keys), so the name is not kept there until the backend ships — the save still succeeds.
 */
export const useReferenceName = (
  endpoint: CustomApiEndpoint | undefined,
  initial: EndpointInitial | undefined,
  paramSource: string
) => {
  const [value, setValue] = useState(endpoint?.referenceLabel ?? initial?.referenceLabel ?? '');
  const shown = paramSource === 'manual';
  const payload: { referenceLabel?: string | null } = shown
    ? { referenceLabel: value.trim() || null }
    : {};
  return { value, setValue, shown, payload };
};

export type ReferenceName = ReturnType<typeof useReferenceName>;
