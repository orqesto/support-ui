import { useState } from 'react';
import type { ConfigCardState } from '@/components/ui/ConfigCard';

/**
 * Which of the three states a configuration card is showing.
 *
 * The rule is deliberately one-directional: `stored` and `empty` are DERIVED from
 * whether the server holds a config, and only `editing` is a thing the user turns
 * on. So a card cannot get stuck displaying a draft — leaving `editing`, by saving
 * or cancelling, always lands back on whatever the server actually has.
 *
 * `configured` flipping underneath an open editor does NOT close it. Someone
 * mid-edit keeps their draft; the refetch is reflected the moment they leave.
 *
 * Callers own their own draft fields and pass `onCancel` to discard them, which is
 * the same re-seeding they already do when stored config changes, invoked
 * deliberately instead of reactively.
 */
export const useConfigCardState = ({
  configured,
  onCancel,
}: {
  configured: boolean;
  onCancel?: () => void;
}): {
  state: ConfigCardState;
  isEditing: boolean;
  startEditing: () => void;
  cancelEditing: () => void;
  /** Call from the save mutation's onSuccess — returns the card to the read-only view. */
  confirmSaved: () => void;
} => {
  const [isEditing, setIsEditing] = useState(false);

  const state: ConfigCardState = isEditing ? 'editing' : configured ? 'stored' : 'empty';

  return {
    state,
    isEditing,
    startEditing: () => setIsEditing(true),
    cancelEditing: () => {
      onCancel?.();
      setIsEditing(false);
    },
    confirmSaved: () => setIsEditing(false),
  };
};
