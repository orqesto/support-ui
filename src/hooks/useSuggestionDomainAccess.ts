/**
 * May this viewer act on a learning suggestion (or undo an auto-action) in a given domain?
 *
 * One copy, used by both panels. They drifted once already: Engine Activity was opened to
 * moderators while the auto-action inbox kept returning `null` for them, which left a moderator
 * able to undo a routing auto-action by API with nowhere in the UI to do it. Two copies of a
 * permission predicate is how that happens.
 *
 * The SERVER is the authority (`learningSuggestionPermission.ts`); this only decides what the UI
 * enables, and an unmapped domain is admin-only here too.
 */
import { useCallback } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import {
  SUGGESTION_DOMAIN_PERMISSIONS,
  permissionForSuggestionDomain,
} from '@/lib/learningSuggestionPermissions';

export const useSuggestionDomainAccess = () => {
  const { isOrgAdmin, hasPermission, hasAnyPermission } = usePermissions();

  const canActOn = useCallback(
    (domain: string): boolean => {
      if (isOrgAdmin) return true;
      const required = permissionForSuggestionDomain(domain);
      return required !== null && hasPermission(required);
    },
    [isOrgAdmin, hasPermission]
  );

  return {
    canActOn,
    /** Enough to show the panel at all: any domain this viewer could act on. */
    canActOnAnyDomain: isOrgAdmin || hasAnyPermission(Object.values(SUGGESTION_DOMAIN_PERMISSIONS)),
  };
};
