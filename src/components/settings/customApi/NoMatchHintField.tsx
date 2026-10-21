import { useState } from 'react';
import { Textarea } from '@/components/ui/Textarea';
import type { CustomApiEndpoint } from '@/services/customApi.service';

/** The backend's limit; the field stops at it rather than failing the save. */
export const NO_MATCH_HINT_MAX = 500;

/**
 * 2026-10-21: what agents read when this lookup finds nothing ("Ask the customer for their order
 * number."). Plain admin text, shown verbatim — no AI, nothing vendor-specific.
 *
 * ⛔ ALWAYS SENT, blank as `null`: the field is always on screen, so a blank box is the admin
 * clearing it, not a step that was never shown. ⚠️ A backend without the column drops the key (its
 * endpoint schemas strip unknown keys), so the save still succeeds; the text is just not kept.
 */
export const useNoMatchHint = (endpoint: CustomApiEndpoint | undefined) => {
  const [value, setValue] = useState(endpoint?.noMatchHint ?? '');
  const payload: { noMatchHint: string | null } = { noMatchHint: value.trim() || null };
  return { value, setValue, payload };
};

export type NoMatchHint = ReturnType<typeof useNoMatchHint>;

export const NoMatchHintField = ({ hint }: { hint: NoMatchHint }) => (
  <div className="space-y-1">
    <Textarea
      id="ca-no-match-hint"
      label="When nothing is found, tell the agent"
      rows={2}
      value={hint.value}
      maxLength={NO_MATCH_HINT_MAX}
      onChange={(event) => hint.setValue(event.target.value)}
    />
    <p className="text-xs text-muted-foreground">
      Optional. Shown to agents when this lookup finds nothing — for example “Ask the customer for
      their order number.”
    </p>
  </div>
);
