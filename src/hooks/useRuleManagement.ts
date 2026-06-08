import { useState, useEffect, useCallback, useRef } from 'react';
import { useDepartmentContextKey } from './useDepartmentContextKey';
import { logger } from '@/lib/logger';

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
  // Callers commonly pass inline arrow functions (DetectionRulesSettings does so
  // because the service returns ApiResponse<T> and needs a `.data` unwrap). Without
  // stabilising via refs, every parent render produces new fn refs → loadRules
  // useCallback dep changes → mount useEffect fires every render → infinite refetch
  // loop (the page "blinks"). Keep latest fn in a ref; effect runs on mount only.
  const fetchRulesRef = useRef(fetchRules);
  const createRuleRef = useRef(createRule);
  const updateRuleRef = useRef(updateRule);
  const deleteRuleRef = useRef(deleteRule);
  const getInitialFormDataRef = useRef(getInitialFormData);
  const getFormDataFromRuleRef = useRef(getFormDataFromRule);

  // Keep refs pointing at the latest fns without invalidating callbacks below.
  fetchRulesRef.current = fetchRules;
  createRuleRef.current = createRule;
  updateRuleRef.current = updateRule;
  deleteRuleRef.current = deleteRule;
  getInitialFormDataRef.current = getInitialFormData;
  getFormDataFromRuleRef.current = getFormDataFromRule;

  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<T[]>([]);
  const [editingRule, setEditingRule] = useState<T | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<T | null>(null);
  const [formData, setFormData] = useState<TFormData>(() => getInitialFormDataRef.current());

  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchRulesRef.current();
      setRules(data);
    } catch (error) {
      logger.error('Error fetching rules:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // SpamRules + DetectionRules controllers honour X-Department-Context on the
  // list endpoints — refetch when the checkbox-driven dept selection changes
  // so the editor shows rules in scope.
  const selectedDeptKey = useDepartmentContextKey();
  useEffect(() => {
    loadRules().catch((error) => {
      logger.error('Failed to fetch rules:', error);
    });
  }, [loadRules, selectedDeptKey]);

  const handleEdit = useCallback((rule: T) => {
    setEditingRule(rule);
    setFormData(getFormDataFromRuleRef.current(rule));
  }, []);

  const handleCreate = useCallback(() => {
    setIsCreating(true);
    setFormData(getInitialFormDataRef.current());
  }, []);

  const handleCancel = useCallback(() => {
    setEditingRule(null);
    setIsCreating(false);
    setFormData(getInitialFormDataRef.current());
  }, []);

  const handleSave = useCallback(async () => {
    try {
      if (editingRule) {
        await updateRuleRef.current(editingRule.id, formData);
      } else if (isCreating) {
        await createRuleRef.current(formData);
      }
      await loadRules();
      handleCancel();
    } catch (error) {
      logger.error('Error saving rule:', error);
      throw error;
    }
  }, [editingRule, isCreating, formData, loadRules, handleCancel]);

  const handleDeleteClick = useCallback((rule: T) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!ruleToDelete) return;

    try {
      await deleteRuleRef.current(ruleToDelete.id);
      await loadRules();
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    } catch (error) {
      logger.error('Error deleting rule:', error);
      throw error;
    }
  }, [ruleToDelete, loadRules]);

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
