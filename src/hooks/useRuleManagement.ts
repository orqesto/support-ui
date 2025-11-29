import { useState, useEffect, useCallback } from 'react';

type UseRuleManagementOptions<T, TFormData> = {
  fetchRules: () => Promise<T[]>;
  createRule: (data: TFormData) => Promise<T>;
  updateRule: (id: number, data: TFormData) => Promise<T>;
  deleteRule: (id: number) => Promise<void>;
  getInitialFormData: () => TFormData;
  getFormDataFromRule: (rule: T) => TFormData;
};

export const useRuleManagement = <T extends { id: number }, TFormData>({
  fetchRules,
  createRule,
  updateRule,
  deleteRule,
  getInitialFormData,
  getFormDataFromRule,
}: UseRuleManagementOptions<T, TFormData>) => {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<T[]>([]);
  const [editingRule, setEditingRule] = useState<T | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<T | null>(null);
  const [formData, setFormData] = useState<TFormData>(getInitialFormData());

  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchRules();
      setRules(data);
    } catch (error) {
      console.error('Error fetching rules:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchRules]);

  useEffect(() => {
    loadRules().catch((error) => {
      console.error('Failed to fetch rules:', error);
    });
  }, [loadRules]);

  const handleEdit = useCallback(
    (rule: T) => {
      setEditingRule(rule);
      setFormData(getFormDataFromRule(rule));
    },
    [getFormDataFromRule]
  );

  const handleCreate = useCallback(() => {
    setIsCreating(true);
    setFormData(getInitialFormData());
  }, [getInitialFormData]);

  const handleCancel = useCallback(() => {
    setEditingRule(null);
    setIsCreating(false);
    setFormData(getInitialFormData());
  }, [getInitialFormData]);

  const handleSave = useCallback(async () => {
    try {
      if (editingRule) {
        await updateRule(editingRule.id, formData);
      } else if (isCreating) {
        await createRule(formData);
      }
      await loadRules();
      handleCancel();
    } catch (error) {
      console.error('Error saving rule:', error);
      throw error;
    }
  }, [editingRule, isCreating, formData, updateRule, createRule, loadRules, handleCancel]);

  const handleDeleteClick = useCallback((rule: T) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!ruleToDelete) return;

    try {
      await deleteRule(ruleToDelete.id);
      await loadRules();
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    } catch (error) {
      console.error('Error deleting rule:', error);
      throw error;
    }
  }, [ruleToDelete, deleteRule, loadRules]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setRuleToDelete(null);
  }, []);

  return {
    // State
    loading,
    rules,
    editingRule,
    isCreating,
    deleteDialogOpen,
    ruleToDelete,
    formData,

    // Setters
    setFormData,

    // Actions
    handleEdit,
    handleCreate,
    handleCancel,
    handleSave,
    handleDeleteClick,
    handleDeleteConfirm,
    handleDeleteCancel,
    loadRules,
  };
};
