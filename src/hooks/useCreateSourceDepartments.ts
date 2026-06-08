import { useState, useEffect, useCallback } from 'react';
import { departmentService, type Department } from '@/services/department.service';
import { integrationsService } from '@/services/integrations.service';
import { logger } from '@/lib/logger';

/**
 * Load active departments once and manage the create-form picker state for a new
 * message source. With Wave 4 smart routing, the safest default is to LINK the
 * new source to every active department (so routeMessage can fan-out across all
 * of them on content match) with the 'info' catch-all dept marked as default.
 * Admin can uncheck before save if they want a narrower scope. (Pre-rename orgs
 * may still have the slug 'general' — both are accepted as the catch-all default.)
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
          // Pre-select all active departments — Wave 4 smart routing fan-out only
          // works for depts that are linked, so the safer default is "all". The
          // 'info' catch-all stays the default landing zone (falls back to legacy
          // 'general' slug, then to the first dept if neither exists).
          const infoDept =
            depts.find((dept) => dept.slug === 'info') ??
            depts.find((dept) => dept.slug === 'general');
          const initial = infoDept ?? depts[0];
          setSelectedIds(depts.map((dept) => dept.id));
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
