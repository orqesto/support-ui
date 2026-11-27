import { useState, useEffect, useCallback, useRef } from 'react';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { logger } from '@/lib/logger';
import {
  EARLIER_SAVE_PENDING_NOTICE,
  earlierSaveFailedNotice,
  getApiErrorMessage,
  getRuleSaveErrorMessage,
  RULE_CHANGED_UNDERNEATH_NOTICE,
  RULES_LOAD_FAILED_MESSAGE,
  RULES_RELOAD_FAILED_MESSAGE,
  shouldShowSaveError,
} from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import { mergeUntouchedFields } from '@/lib/sameFormValues';

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
  const [notice, setNotice] = useState<{
    /** pending: an earlier write still runs; changed: it landed; failed: it was refused. */
    kind: 'pending' | 'changed' | 'failed';
    text: string;
  } | null>(null);
  const saveNotice = notice?.text ?? null;
  /**
   * Rule ids with a write still in flight: an editor save or a list on/off switch. Two writes of
   * one rule in flight could land in either order and the older could win, so while one runs an
   * editor reopened on that rule waits and that rule's switch is disabled. Only that rule waits.
   * `busyRowIds` is the same set as state, for rendering.
   */
  const pendingRowsRef = useRef(new Map<number, number>());
  const [busyRowIds, setBusyRowIds] = useState<ReadonlySet<number>>(() => new Set());
  const syncBusyRows = useCallback(() => {
    setBusyRowIds(new Set(pendingRowsRef.current.keys()));
  }, []);
  /** True when the list did not reload after a write: it may show old values. */
  const listStaleRef = useRef(false);
  /** False until a load succeeds: before that a failure is "could not load", not "out of date". */
  const loadedOnceRef = useRef(false);
  /** A load (or quiet reload) answered: the list is current again. */
  const markLoaded = useCallback(() => {
    listStaleRef.current = false;
    loadedOnceRef.current = true;
  }, []);
  /** A load failed: say so, and do not open an editor from the list until a reload succeeds. */
  const markLoadFailed = useCallback((error: unknown) => {
    listStaleRef.current = true;
    const line = loadedOnceRef.current ? RULES_RELOAD_FAILED_MESSAGE : RULES_LOAD_FAILED_MESSAGE;
    // A refusal's own reason (a 4xx the backend wrote for a person) follows the line.
    const reason = getApiErrorMessage(error);
    toast.error(reason ? `${line} ${reason}` : line);
  }, []);
  /**
   * A new editor session (open, close, or a forced close): any request still in flight belongs to
   * the old one, so `saving` restarts here and that request's answer is ignored when it lands.
   */
  const startSession = useCallback(() => {
    sessionRef.current += 1;
    savingRef.current = false;
    setSaving(false);
    setNotice(null);
  }, []);
  /** The current editor session, for a page that sets its own inline state after an await. */
  const getSession = useCallback(() => sessionRef.current, []);
  const setFormData = useCallback((next: TFormData) => {
    // Typing answers a refusal — this save's, or the earlier one's — but not the other notices.
    setSaveError(null);
    setNotice((current) => (current?.kind === 'failed' ? null : current));
    setFormDataState(next);
  }, []);
  // Latest editor row for callbacks that resolve after an await (a stale closure would miss an
  // editor opened while the request was in flight).
  const editingRuleRef = useRef<T | null>(null);
  editingRuleRef.current = editingRule;
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  /**
   * (Re)load the list. A failure is shown, and the list is marked stale: an editor is then not
   * opened from it (its values may be old, and saving them would write them back) until a reload
   * succeeds. Resolves to the rows, or null when the load failed.
   */
  const loadRules = useCallback(async (): Promise<T[] | null> => {
    try {
      setLoading(true);
      const data = await fetchRulesRef.current();
      setRules(data);
      markLoaded();
      return data;
    } catch (error) {
      logger.error('Error fetching rules:', error);
      markLoadFailed(error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [markLoaded, markLoadFailed]);

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
      markLoaded();
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
      // The outside change (an accepted suggestion) did happen; the list just could not show it.
      logger.error('Error reloading rules:', error);
      markLoadFailed(error);
    }
  }, [setFormData, startSession, markLoaded, markLoadFailed]);

  // SpamRules + DetectionRules controllers honour X-Department-Context on the
  // list endpoints — refetch when the checkbox-driven dept selection changes
  // so the editor shows rules in scope.
  const selectedDeptKey = useDepartmentContextKey();
  useEffect(() => {
    loadRules().catch((error) => {
      logger.error('Failed to fetch rules:', error);
    });
  }, [loadRules, selectedDeptKey]);

  const openEditor = useCallback(
    (rule: T) => {
      startSession();
      setEditingRule(rule);
      setFormData(getFormDataFromRuleRef.current(rule));
      if (pendingRowsRef.current.has(rule.id)) {
        // An earlier write of this rule is still in flight: wait for it, and say why.
        savingRef.current = true;
        setSaving(true);
        setNotice({ kind: 'pending', text: EARLIER_SAVE_PENDING_NOTICE });
      }
    },
    [setFormData, startSession]
  );

  const handleEdit = useCallback(
    (rule: T) => {
      if (!listStaleRef.current) {
        openEditor(rule);
        return;
      }
      // The list may hold old values: reload first and open the fresh row (or nothing, if the
      // reload fails again — loadRules says so).
      void loadRules().then((data) => {
        const fresh = data?.find((row) => row.id === rule.id);
        if (fresh) openEditor(fresh);
      });
    },
    [openEditor, loadRules]
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
   * An earlier write of rule `rowId` (an editor save or the list's switch) succeeded while the
   * person has that rule open. Field by field: a field they did not change takes the saved value
   * (else saving would write the old one back — the on/off flag included); a field they changed
   * keeps their text, and then a line says so. The open session and its `saving` are left alone.
   */
  const applyLateSave = useCallback((rowId: number, saved: T) => {
    const open = editingRuleRef.current;
    if (open?.id !== rowId) return;
    const toForm = getFormDataFromRuleRef.current;
    const { merged, kept } = mergeUntouchedFields(
      formDataRef.current as object,
      toForm(open) as object,
      toForm(saved) as object
    );
    setEditingRule(saved);
    setFormDataState(merged as TFormData);
    if (kept.length > 0) setNotice({ kind: 'changed', text: RULE_CHANGED_UNDERNEATH_NOTICE });
  }, []);

  const holdRow = useCallback(
    (rowId: number) => {
      pendingRowsRef.current.set(rowId, (pendingRowsRef.current.get(rowId) ?? 0) + 1);
      syncBusyRows();
    },
    [syncBusyRows]
  );
  /**
   * A write of `rowId` answered. When the editor open on that rule belongs to a NEWER session it
   * was only waiting for this write (it could not send its own): it may save now. Another
   * editor's `saving` is its own and untouched.
   */
  const releaseRow = useCallback(
    (rowId: number, writerSession: number | null) => {
      const left = (pendingRowsRef.current.get(rowId) ?? 1) - 1;
      if (left > 0) pendingRowsRef.current.set(rowId, left);
      else pendingRowsRef.current.delete(rowId);
      syncBusyRows();
      if (
        sessionRef.current !== writerSession &&
        editingRuleRef.current?.id === rowId &&
        !pendingRowsRef.current.has(rowId)
      ) {
        savingRef.current = false;
        setSaving(false);
        setNotice((current) => (current?.kind === 'pending' ? null : current));
      }
    },
    [syncBusyRows]
  );

  /**
   * A write of one rule from outside the editor (the list's on/off switch). It waits its turn
   * like an editor save: while another write of that rule is in flight it is not sent and this
   * resolves false. An editor open on that rule takes the saved row like a late save. Then the
   * list reloads. A failure is thrown to the caller, which shows it.
   */
  const runRowWrite = useCallback(
    async (rowId: number, write: () => Promise<T>): Promise<boolean> => {
      if (pendingRowsRef.current.has(rowId)) return false;
      holdRow(rowId);
      try {
        const saved = await write();
        applyLateSave(rowId, saved);
      } finally {
        releaseRow(rowId, null);
      }
      await loadRules();
      return true;
    },
    [holdRow, releaseRow, applyLateSave, loadRules]
  );

  const handleSave = useCallback(async () => {
    // One request per click-through: a second click while it is in flight is ignored.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const session = sessionRef.current;
    const rowId = editingRule ? editingRule.id : null;
    setSaveError(null);
    setNotice(null);
    if (rowId !== null) holdRow(rowId);
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
      if (shouldShowSaveError(error)) {
        if (sessionRef.current === session) {
          setSaveError(getRuleSaveErrorMessage(error));
        } else if (rowId !== null && editingRuleRef.current?.id === rowId) {
          // The person reopened this rule while the save ran: the first edit is lost — say so.
          setNotice({
            kind: 'failed',
            text: earlierSaveFailedNotice(getRuleSaveErrorMessage(error)),
          });
        }
      }
      throw error;
    } finally {
      if (rowId !== null) releaseRow(rowId, session);
      if (sessionRef.current === session) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }, [editingRule, isCreating, formData, loadRules, handleCancel, applyLateSave, holdRow, releaseRow]);

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
    busyRowIds,
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
    runRowWrite,
  };
};
