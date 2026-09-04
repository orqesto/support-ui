import { useState, useCallback } from 'react';
import { integrationsService } from '@/services/integrations.service';
import { logger } from '@/lib/logger';
import type { AlertState } from '@/components/settings/integrations/types';

type UseIntegrationCardOptions<T> = {
  integrationType: string;
  integrationDisplayName: string;
  initialConfig: T;
  onRefresh: () => Promise<void>;
  onShowAlert: (alert: AlertState) => void;
  /**
   * Called after a successful CREATE (not update) with the new integration id.
   * Use this to chain post-create work like department assignment. Failures inside
   * the callback should NOT throw — handle them in-line (the integration itself was
   * already created successfully).
   */
  onCreated?: (newIntegrationId: number) => Promise<void> | void;
  /**
   * CREATE only: departments to link atomically with the insert. Prefer this over
   * doing the assignment in `onCreated` — a follow-up call leaves the source enabled
   * and ingesting with no department links until it lands (or forever, if it fails).
   */
  createDepartments?: { departmentIds: number[]; defaultDepartmentId?: number };
  /**
   * Names already taken by integrations of this type in this workspace. The BE's
   * `POST /api/integrations` is an UPSERT keyed on `name + type` (+ department), so a
   * CREATE under a taken name silently overwrites that row. With this list the default
   * name is made distinct and a typed collision is refused instead of committed.
   */
  existingNames?: ReadonlyArray<string>;
  /**
   * A name derived from the config being typed — the bot id inside a Telegram token, a
   * WhatsApp phone-number id — so a second bot or number gets its own row by default.
   */
  deriveName?: (config: T) => string | null;
};

/** `base`, else `base 2`, `base 3`, … — the first not already taken. */
export const distinctName = (base: string, taken: ReadonlyArray<string>): string => {
  if (!taken.includes(base)) return base;
  let suffix = 2;
  while (taken.includes(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
};

export const useIntegrationCard = <T extends Record<string, unknown>>({
  integrationType,
  integrationDisplayName,
  initialConfig,
  onRefresh,
  onShowAlert,
  onCreated,
  createDepartments,
  existingNames = [],
  deriveName,
}: UseIntegrationCardOptions<T>) => {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  // The name of the row being edited — the upsert's identity, so an EDIT must send it
  // back verbatim. It used to send the constant display name: an edit of "Ops Slack"
  // created a second row, and a second workspace created under the constant overwrote
  // the first.
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [config, setConfig] = useState<T>(initialConfig);

  const suggestedName =
    editingId !== null
      ? (editingName ?? integrationDisplayName)
      : distinctName(deriveName?.(config) ?? integrationDisplayName, existingNames);
  const name = nameOverride ?? suggestedName;

  const resetForm = useCallback(() => {
    setConfig(initialConfig);
    setShowForm(false);
    setEditingId(null);
    setEditingName(null);
    setNameOverride(null);
  }, [initialConfig]);

  const loadForEdit = useCallback((id: number, currentConfig: T, currentName?: string) => {
    setEditingId(id);
    setEditingName(currentName ?? null);
    setNameOverride(null);
    setConfig(currentConfig);
    setShowForm(true);
  }, []);

  const saveIntegration = useCallback(
    async (customName?: string) => {
      const isEdit = editingId !== null;
      // EDIT: the stored name is the upsert key; the typed name (if changed) is applied by
      // id afterwards. CREATE: the typed/derived name, refused if it would land on a row.
      const upsertName = customName ?? (isEdit ? (editingName ?? name) : name.trim());
      if (!isEdit && customName === undefined && existingNames.includes(upsertName)) {
        onShowAlert({
          open: true,
          title: 'Name already in use',
          description: `A ${integrationDisplayName} named "${upsertName}" already exists. Choose a different name — saving under the same one would overwrite it.`,
          variant: 'error',
        });
        return;
      }
      setSaving(true);
      try {
        const response = await integrationsService.upsert({
          name: upsertName,
          type: integrationType,
          enabled: true,
          config: config as Record<string, unknown>,
          ...(createDepartments?.departmentIds.length
            ? {
                departmentIds: createDepartments.departmentIds,
                defaultDepartmentId: createDepartments.defaultDepartmentId,
              }
            : {}),
        });

        if (response.success) {
          // If this was a fresh CREATE, hand the new id to the caller for post-create work
          // (e.g., department M:N assignment). Caller is responsible for non-throwing handling.
          const isCreate = response.action !== 'updated';
          if (isCreate && onCreated && response.data?.id) {
            await onCreated(response.data.id);
          }
          // A rename on edit goes by id — the upsert cannot do it without creating a row.
          const renamedTo = name.trim();
          if (isEdit && customName === undefined && renamedTo && renamedTo !== upsertName) {
            await integrationsService.update(editingId, { name: renamedTo, type: integrationType });
          }
          await onRefresh();
          resetForm();
          onShowAlert({
            open: true,
            title: 'Success',
            description: `${integrationDisplayName} saved successfully!`,
            variant: 'success',
          });
        }
      } catch (error) {
        logger.error(`Failed to save ${integrationDisplayName}:`, error);
        onShowAlert({
          open: true,
          title: 'Error',
          description: `Failed to save ${integrationDisplayName}`,
          variant: 'error',
        });
      } finally {
        setSaving(false);
      }
    },
    [
      config,
      editingId,
      editingName,
      existingNames,
      name,
      integrationType,
      integrationDisplayName,
      onRefresh,
      onShowAlert,
      onCreated,
      createDepartments,
      resetForm,
    ]
  );

  const testConnection = useCallback(
    async (id: number, name: string) => {
      setTesting(id);
      try {
        const response = await integrationsService.test(id, integrationType);
        if (response.success) {
          onShowAlert({
            open: true,
            title: 'Test Successful',
            description: `${name} connection test successful!`,
            variant: 'success',
          });
        } else {
          onShowAlert({
            open: true,
            title: 'Test Failed',
            description: `${name} connection test failed: ${response.message ?? 'Unknown error'}`,
            variant: 'error',
          });
        }
      } catch (error) {
        logger.error(`Failed to test ${name} connection:`, error);
        onShowAlert({
          open: true,
          title: 'Test Failed',
          description: `Failed to test ${name} connection`,
          variant: 'error',
        });
      } finally {
        setTesting(null);
      }
    },
    [integrationType, onShowAlert]
  );

  const deleteIntegration = useCallback(
    async (id: number, name: string) => {
      setDeleting(id);
      try {
        const response = await integrationsService.delete(id, integrationType);
        if (response.success) {
          await onRefresh();
          setDeleteConfirm(null);
          onShowAlert({
            open: true,
            title: 'Success',
            description: `${name} deleted successfully!`,
            variant: 'success',
          });
        }
      } catch (error) {
        logger.error(`Failed to delete ${name}:`, error);
        onShowAlert({
          open: true,
          title: 'Error',
          description: `Failed to delete ${name}`,
          variant: 'error',
        });
      } finally {
        setDeleting(null);
      }
    },
    [integrationType, onRefresh, onShowAlert]
  );

  return {
    // State
    showForm,
    saving,
    testing,
    deleting,
    deleteConfirm,
    editingId,
    config,
    name,

    // Setters
    setShowForm,
    setConfig,
    setDeleteConfirm,
    setName: setNameOverride,

    // Actions
    resetForm,
    loadForEdit,
    saveIntegration,
    testConnection,
    deleteIntegration,
  };
};
