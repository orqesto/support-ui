import { useState, useEffect, useCallback } from 'react';
import { departmentService, type Department } from '@/services/department.service';
import { integrationsService } from '@/services/integrations.service';
import { logger } from '@/lib/logger';

/**
 * Load active departments once and manage the create-form picker state for a new
 * message source. Defaults selection to [first department] so single-dept orgs
 * don't have to make a choice.
 *
 * Exposes `assignToNewSource(id)` which persists the current selection to the
 * messageSourceDepartments M:N table. Failures are logged but not thrown — the
 * integration itself is already created at that point.
 */
export const useCreateSourceDepartments = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [defaultId, setDefaultId] = useState<number | undefined>();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const depts = await departmentService.getAll();
        if (cancelled) return;
        setDepartments(depts);
        if (depts.length > 0) {
          // Prefer the 'general' catch-all department as the default — it's the
          // safest landing zone for new sources before the user thinks about routing.
          // Fall back to the first department only if 'general' doesn't exist.
          const general = depts.find((dept) => dept.slug === 'general');
          const initial = general ?? depts[0];
          setSelectedIds([initial.id]);
          setDefaultId(initial.id);
        }
      } catch (err) {
        logger.error('Failed to load departments for source create form:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Persist the current selection to a newly created message source.
   * Returns true on success, false if the call failed (caller can surface a warning).
   */
  const assignToNewSource = useCallback(
    async (newIntegrationId: number): Promise<boolean> => {
      if (selectedIds.length === 0) return true; // nothing to do
      try {
        await integrationsService.setSourceDepartments(newIntegrationId, selectedIds, defaultId);
        return true;
      } catch (err) {
        logger.error('Failed to assign departments to new integration:', err);
        return false;
      }
    },
    [selectedIds, defaultId]
  );

  return {
    departments,
    loading,
    selectedIds,
    setSelectedIds,
    defaultId,
    setDefaultId,
    /** Whether the picker has at least one department selected. */
    isValid: selectedIds.length > 0,
    assignToNewSource,
  };
};
