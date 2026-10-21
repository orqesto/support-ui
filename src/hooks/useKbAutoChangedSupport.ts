import { useEffect, useRef, useState } from 'react';
import type { KbFilterStatus } from '@/components/kb/KbStatusFilter';
import { useAuthStore } from '@/stores/authStore';

/**
 * Does the backend know "Changed automatically" (`filters.autoChangedStatus`)? null: not asked
 * yet. Asked of an older backend, which ignores the status, it says no once and the list shows
 * today's "Removed automatically" instead. The answer belongs to one workspace: switching
 * workspace forgets it (another deployment of the backend may know more).
 */
export const useKbAutoChangedSupport = (
  appliedStatus: { requested: KbFilterStatus; applied: boolean } | null,
  setFilterStatus: (next: KbFilterStatus) => void
): boolean | null => {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    if (appliedStatus?.requested !== 'auto_changed') return;
    setSupported(appliedStatus.applied);
    if (!appliedStatus.applied) setFilterStatus('auto_removed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedStatus]);
  const organizationId = useAuthStore((state) => state.selectedOrganizationId);
  const seenOrganization = useRef(organizationId);
  useEffect(() => {
    if (seenOrganization.current === organizationId) return;
    seenOrganization.current = organizationId;
    setSupported(null);
  }, [organizationId]);
  return supported;
};
