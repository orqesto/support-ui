import { useState, useEffect, useCallback, useRef } from 'react';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { logger } from '@/lib/logger';
import {
  EARLIER_SAVE_PENDING_NOTICE,
  getRuleSaveErrorMessage,
  RULE_CHANGED_UNDERNEATH_NOTICE,
  shouldShowSaveError,
} from '@/lib/errorMessages';
import { sameFormValues } from '@/lib/sameFormValues';

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
  const [formData, setFormDataState] = useState<TFormData>(() => getInitialFormDataRef.current());
  // Why the last create/update was refused; shown inside the open dialog. Cleared on edit, close
  // and the next save.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Bumped whenever an editor opens or closes. A save answers for the editor it was sent from; if
  // the person has moved on (Cancel, then Edit another rule) the late answer must not touch it.
  const sessionRef = useRef(0);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  /**
   * A non-error line for the open editor: its rule was just saved by an earlier editor session
   * (the person cancelled and reopened while that save was in flight). Cleared with the session.
   */
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  /**
   * Rule ids with an update still in flight. An editor reopened on such a rule waits for it before
   * it may save: two writes of one rule in flight could land in either order and the older could
   * win. Only that rule waits; any other editor saves at once.
   */
  const pendingRowsRef = useRef(new Map<number, number>());
  /**
   * A new editor session (open, close, or a forced close): any request still in flight belongs to
   * the old one, so `saving` restarts here and that request's answer is ignored when it lands.
   */
  const startSession = useCallback(() => {
    sessionRef.current += 1;
    savingRef.current = false;
    setSaving(false);
    setSaveNotice(null);
  }, []);
  /** The current editor session, for a page that sets its own inline state after an await. */
  const getSession = useCallback(() => sessionRef.current, []);
  const setFormData = useCallback((next: TFormData) => {
    setSaveError(null);
    setFormDataState(next);
  }, []);
  // Latest editor row for callbacks that resolve after an await (a stale closure would miss an
  // editor opened while the request was in flight).
  const editingRuleRef = useRef<T | null>(null);
  editingRuleRef.current = editingRule;
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

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

  /**
   * Reload after something OUTSIDE this page changed rules (an accepted engine suggestion can add,
   * promote, disable or rewrite one). Quiet: no loading flag. An open editor whose rule changed on
   * the server — or is gone — is closed: its form holds the OLD values, and saving it would
   * silently undo that change. An editor whose rule did not change keeps the person's typing.
   */
  const reloadAfterOutsideChange = useCallback(async () => {
    try {
      const data = await fetchRulesRef.current();
      setRules(data);
      const open = editingRuleRef.current;
      if (!open) return;
      const fresh = data.find((rule) => rule.id === open.id);
      const toForm = getFormDataFromRuleRef.current;
      if (!fresh || JSON.stringify(toForm(fresh)) !== JSON.stringify(toForm(open))) {
        startSession();
        setEditingRule(null);
        setFormData(getInitialFormDataRef.current());
      }
    } catch (error) {
      logger.error('Error reloading rules:', error);
    }
  }, [setFormData, startSession]);

  // SpamRules + DetectionRules controllers honour X-Department-Context on the
  // list endpoints — refetch when the checkbox-driven dept selection changes
  // so the editor shows rules in scope.
  const selectedDeptKey = useDepartmentContextKey();
  useEffect(() => {
    loadRules().catch((error) => {
      logger.error('Failed to fetch rules:', error);
    });
  }, [loadRules, selectedDeptKey]);

  const handleEdit = useCallback(
    (rule: T) => {
      startSession();
      setEditingRule(rule);
      setFormData(getFormDataFromRuleRef.current(rule));
      if (pendingRowsRef.current.has(rule.id)) {
        // An earlier save of this rule is still in flight: wait for it, and say why.
        savingRef.current = true;
        setSaving(true);
        setSaveNotice(EARLIER_SAVE_PENDING_NOTICE);
      }
    },
    [setFormData, startSession]
  );

  const handleCreate = useCallback(() => {
    startSession();
    setIsCreating(true);
    setFormData(getInitialFormDataRef.current());
  }, [setFormData, startSession]);

  const handleCancel = useCallback(() => {
    startSession();
    setEditingRule(null);
    setIsCreating(false);
    setFormData(getInitialFormDataRef.current());
  }, [setFormData, startSession]);

  /**
   * An earlier session's update of rule `rowId` succeeded after the person reopened that same
   * rule. An untouched form takes the saved values (else saving it would write the old ones
   * back); a form they typed in keeps their text and says the rule changed underneath. The open
   * session and its `saving` are left alone.
   */
  const applyLateSave = useCallback((rowId: number, saved: T) => {
    const open = editingRuleRef.current;
    if (open?.id !== rowId) return;
    const toForm = getFormDataFromRuleRef.current;
    const untouched = sameFormValues(formDataRef.current as object, toForm(open) as object);
    setEditingRule(saved);
    if (untouched) {
      setFormDataState(toForm(saved));
    } else {
      setSaveNotice(RULE_CHANGED_UNDERNEATH_NOTICE);
    }
  }, []);

  const handleSave = useCallback(async () => {
    // One request per click-through: a second click while it is in flight is ignored.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const session = sessionRef.current;
    const rowId = editingRule ? editingRule.id : null;
    setSaveError(null);
    setSaveNotice(null);
    if (rowId !== null) {
      pendingRowsRef.current.set(rowId, (pendingRowsRef.current.get(rowId) ?? 0) + 1);
    }
    try {
      if (editingRule) {
        const saved = await updateRuleRef.current(editingRule.id, formData);
        if (sessionRef.current !== session) applyLateSave(editingRule.id, saved);
      } else if (isCreating) {
        await createRuleRef.current(formData);
      }
      await loadRules();
      if (sessionRef.current === session) handleCancel();
    } catch (error) {
      logger.error('Error saving rule:', error);
      if (sessionRef.current === session && shouldShowSaveError(error)) {
        setSaveError(getRuleSaveErrorMessage(error));
      }
      throw error;
    } finally {
      if (rowId !== null) {
        const left = (pendingRowsRef.current.get(rowId) ?? 1) - 1;
        if (left > 0) pendingRowsRef.current.set(rowId, left);
        else pendingRowsRef.current.delete(rowId);
      }
      if (sessionRef.current === session) {
        savingRef.current = false;
        setSaving(false);
      } else if (rowId !== null && editingRuleRef.current?.id === rowId && !pendingRowsRef.current.has(rowId)) {
        // The newer editor is on this same rule and was only waiting for this write (it could not
        // send its own): it may save now. Any other editor's `saving` is its own and untouched.
        savingRef.current = false;
        setSaving(false);
        setSaveNotice((notice) => (notice === EARLIER_SAVE_PENDING_NOTICE ? null : notice));
      }
    }
  }, [editingRule, isCreating, formData, loadRules, handleCancel, applyLateSave]);

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
    saveError,
    saveNotice,
    saving,
    getSession,

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
    reloadAfterOutsideChange,
  };
};
