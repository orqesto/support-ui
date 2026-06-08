import { useAuthStore } from '@/stores/authStore';
import { useDepartmentContextStore } from '@/stores/departmentContextStore';

/**
 * Returns a stable string snapshot of the current user's checkbox-driven
 * department selection (the one that becomes the `X-Department-Context` CSV
 * header on outgoing requests).
 *
 * Use this as a dependency on data-fetching effects / `useCallback`s and as
 * part of cache keys. Example:
 *
 * ```ts
 * const selectedDeptKey = useDepartmentContextKey();
 * useEffect(() => {
 *   void fetchSomething(); // axios interceptor adds the header at request time
 * }, [filterX, selectedDeptKey]);
 * ```
 *
 * Why this hook instead of `useDepartmentContextStore((s) => s.getSelectedDeptIds())`:
 * the store's getter falls back to a fresh `[]` on miss, which would trigger
 * an infinite re-render under Zustand's referential-equality default selector
 * check. Subscribing here to primitive slices and computing the string in the
 * component body avoids that trap.
 */
export const useDepartmentContextKey = (): string => {
  const selectedByKey = useDepartmentContextStore((state) => state._selectedByKey);
  const userId = useAuthStore((state) => state.user?.id);
  const orgId = useAuthStore((state) => state.selectedOrganizationId);
  if (userId === undefined || orgId === null) return '';
  return (selectedByKey[`${userId}:${orgId}`] ?? []).join(',');
};
