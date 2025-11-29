import { useState, useCallback } from 'react';
import { integrationsService } from '@/services/integrations.service';
import type { AlertState } from '@/components/settings/integrations/types';

type UseIntegrationCardOptions<T> = {
  integrationType: string;
  integrationDisplayName: string;
  initialConfig: T;
  onRefresh: () => Promise<void>;
  onShowAlert: (alert: AlertState) => void;
};

export const useIntegrationCard = <T extends Record<string, unknown>>({
  integrationType,
  integrationDisplayName,
  initialConfig,
  onRefresh,
  onShowAlert,
}: UseIntegrationCardOptions<T>) => {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [config, setConfig] = useState<T>(initialConfig);

  const resetForm = useCallback(() => {
    setConfig(initialConfig);
    setShowForm(false);
    setEditingId(null);
  }, [initialConfig]);

  const loadForEdit = useCallback((id: number, currentConfig: T) => {
    setEditingId(id);
    setConfig(currentConfig);
    setShowForm(true);
  }, []);

  const saveIntegration = useCallback(
    async (customName?: string) => {
      setSaving(true);
      try {
        const response = await integrationsService.upsert({
          name: customName ?? integrationDisplayName,
          type: integrationType,
          enabled: true,
          config: config as Record<string, unknown>,
        });

        if (response.success) {
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
        console.error(`Failed to save ${integrationDisplayName}:`, error);
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
    [config, integrationType, integrationDisplayName, onRefresh, onShowAlert, resetForm]
  );

  const testConnection = useCallback(
    async (id: number, name: string) => {
      setTesting(id);
      try {
        const response = await integrationsService.test(id);
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
        console.error(`Failed to test ${name} connection:`, error);
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
    [onShowAlert]
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
        console.error(`Failed to delete ${name}:`, error);
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

    // Setters
    setShowForm,
    setConfig,
    setDeleteConfirm,

    // Actions
    resetForm,
    loadForEdit,
    saveIntegration,
    testConnection,
    deleteIntegration,
  };
};
