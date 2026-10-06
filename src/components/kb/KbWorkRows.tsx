/**
 * KB cases worklist: the entries behind a case or a set-aside finding, each with what can be done
 * to it — Approve / Reject / Hide / Unhide, Edit, Move into a case, Remove from case (a member of
 * the case), Unmerge (the case's own row), Open thread.
 *
 * ⛔ An entry reads the same here as in the KB list: its status is the list's own `KBStatusBadge`,
 * and its actions are offered by the list's own rules (`offersReviewActions`, approved / hidden /
 * rejected) — gated by the server per entry: `canModerate` for approve / reject / hide / unhide /
 * edit (the KB list's canReview), `canDecide` for what case it is in (move / remove / unmerge), so
 * nothing is offered that answers 403. What is not offered says why, in one line.
 * After every action the row changes at once and the report is re-read.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { KBEntryEditDialog } from './KBEntryEditDialog';
import { KbMoveToCaseDialog, type KbMoveTarget } from './KbMoveToCaseDialog';
import { KbWorkRowItem } from './KbWorkRowItem';
import { runCaseAction } from './runCaseAction';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { kbRef } from '@/lib/kbConsolidation';
import { kbService, type KBEntry } from '@/services/kb.service';
import {
  kbConsolidationService,
  type KbSetAsideReason,
  type KbWorkRow,
} from '@/services/kbConsolidation.service';

import {
  ACTION_FAILED,
  ATTACH_REFUSED,
  DETACH_REFUSED,
  STATUS_AFTER,
  WORK_ROWS_PAGE,
  chunk,
  headline,
  refusalText,
  type BusyAction,
  type KbWorkNotice,
  type RowAction,
} from './kbWorkRowModel';

export {
  SET_ASIDE_REASON_LABEL,
  WORK_ROWS_PAGE,
  asListEntry,
  isCaseEntry,
  mayModerate,
  type KbWorkNotice,
} from './kbWorkRowModel';

type KbWorkRowsProps = {
  /** The entries to list, in order. */
  ids: number[];
  /** The case these are the entries of (its own row is listed first, as the case). */
  caseContext?: {
    caseId: number;
    casePublicId: string | null;
    /** Its LIVE members as the server counts them (`last_member`); absent on an older backend. */
    memberCount?: number;
  } | null;
  /** Set-aside reason per entry, shown as a badge. */
  reasons?: ReadonlyMap<number, KbSetAsideReason>;
  /** The departments the report covers: where "Move into case" searches for cases. */
  departmentIds: number[];
  /**
   * Re-read the report (the backend clears its cache on every entry write). Resolves once the
   * report has answered, when the caller can tell.
   */
  onChanged: () => void | Promise<unknown>;
  /** The page's own line (an Unmerge, whose list goes away); null clears it. */
  onNotice: (notice: KbWorkNotice | null) => void;
  /**
   * The line about this list's last move / removal, held by a parent that outlives the list (the
   * set-aside list empties when its last row leaves). Absent: the list holds and shows its own.
   */
  listNotice?: KbWorkNotice | null;
  onListNotice?: (notice: KbWorkNotice | null) => void;
  /** Names the list for assistive tech. */
  label: string;
  /** How many rows to ask for at once. */
  pageSize?: number;
};

export const KbWorkRows = ({
  ids,
  caseContext = null,
  reasons,
  departmentIds,
  onChanged,
  onNotice,
  listNotice = null,
  onListNotice,
  label,
  pageSize = WORK_ROWS_PAGE,
}: KbWorkRowsProps) => {
  const orgCode = useCurrentOrgCode();
  const [shown, setShown] = useState(pageSize);
  const visibleIds = useMemo(() => ids.slice(0, shown), [ids, shown]);
  const visibleKey = visibleIds.join(',');
  const [rows, setRows] = useState<Map<number, KbWorkRow> | null>(null);
  // The ids the rows on screen were read for: until the new ones answer, nothing is "missing".
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: number; action: BusyAction } | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  // The line about a move / removal: shown next to the rows it is about — by the parent when it
  // holds it (it must outlive this list), else here.
  const [ownNotice, setOwnNotice] = useState<KbWorkNotice | null>(null);
  const notice = onListNotice ? listNotice : ownNotice;
  const setNotice = onListNotice ?? setOwnNotice;
  const [editing, setEditing] = useState<KBEntry | null>(null);
  const [editLoading, setEditLoading] = useState<number | null>(null);
  const [moving, setMoving] = useState<KbWorkRow | null>(null);
  const [detaching, setDetaching] = useState<KbWorkRow | null>(null);
  const [unmerging, setUnmerging] = useState<KbWorkRow | null>(null);
  const [approveInstead, setApproveInstead] = useState<KbWorkRow | null>(null);

  // The handlers an action calls when it ANSWERS are the newest ones — never those captured when
  // it was sent (a department or page switched meanwhile would reload the scope just left).
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  // Only the newest read may write: a slow answer for ids that changed meanwhile is dropped.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++latest.current;
    const askFor = visibleKey ? visibleKey.split(',').map(Number) : [];
    setLoadError(null);
    try {
      const pages = await Promise.all(
        chunk(askFor).map((ids) => kbConsolidationService.getWorkRows(ids))
      );
      if (requestId !== latest.current) return;
      if (pages.some((page) => page === null)) {
        setUnsupported(true);
        return;
      }
      const next = new Map<number, KbWorkRow>();
      for (const page of pages) for (const row of page ?? []) next.set(row.id, row);
      setRows(next);
      setLoadedKey(visibleKey);
    } catch (err) {
      if (requestId !== latest.current) return;
      setLoadError(getApiErrorMessage(err) ?? 'Could not load these entries.');
    }
  }, [visibleKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = (id: number, patch: Partial<KbWorkRow>) =>
    setRows((prev) => {
      if (!prev?.has(id)) return prev;
      const next = new Map(prev);
      next.set(id, { ...(prev.get(id) as KbWorkRow), ...patch });
      return next;
    });

  /**
   * Read one row as it is now. Dropped when the list was re-read meanwhile: that read is newer
   * than this one, and the row it brought must not be overwritten by an older answer.
   */
  const rereadRow = async (id: number): Promise<KbWorkRow | null> => {
    const generation = latest.current;
    const fresh = await kbConsolidationService.getWorkRows([id]);
    const now = fresh?.find((candidate) => candidate.id === id) ?? null;
    if (now && generation === latest.current) patchRow(id, now);
    return now;
  };

  const setRowError = (id: number, message: string | null) =>
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message === null) delete next[id];
      else next[id] = message;
      return next;
    });

  // Where focus goes when the row acted on leaves the list (the next row, else the list).
  const listRef = useRef<HTMLUListElement>(null);
  // The row an action was taken on, until the report re-read after it answered (`settled`).
  const actedOn = useRef<{ id: number; index: number; settled?: boolean } | null>(null);
  // A refused move / removal: focus goes back to the button that started it.
  const refocus = useRef<{ id: number; action: 'move' | 'detach' } | null>(null);
  const [settledTick, setSettledTick] = useState(0);
  const listedIds = useMemo(
    () => (rows ? visibleIds.filter((id) => rows.has(id)) : []),
    [rows, visibleIds]
  );
  useEffect(() => {
    const acted = actedOn.current;
    if (!acted) return;
    const active = document.activeElement;
    // Only when focus was lost (with the row, or with a dialog) — never pulled from where the
    // viewer moved it.
    const lost = !active || active === document.body || !document.body.contains(active);
    if (listedIds.includes(acted.id)) {
      // Still here once the report answered: nothing more to do — never steal focus later.
      if (!acted.settled) return;
      actedOn.current = null;
      const back = refocus.current;
      refocus.current = null;
      if (back?.id === acted.id && lost)
        listRef.current
          ?.querySelector<HTMLElement>(`[data-row-id="${back.id}"] [data-action="${back.action}"]`)
          ?.focus();
      return;
    }
    actedOn.current = null;
    refocus.current = null;
    if (!lost) return;
    const nextId = listedIds[Math.min(acted.index, listedIds.length - 1)];
    const target =
      nextId !== undefined
        ? listRef.current?.querySelector<HTMLElement>(`[data-row-id="${nextId}"]`)
        : listRef.current;
    target?.focus();
  }, [listedIds, settledTick]);

  /**
   * After an action: re-read the report when it changed something, then mark the action settled
   * (the effect above then moves focus on, or lets go of the row).
   */
  const settle = (reread: boolean, refocusOn?: 'move' | 'detach') => {
    const acted = actedOn.current;
    if (acted && refocusOn) refocus.current = { id: acted.id, action: refocusOn };
    const done = () => {
      if (acted && actedOn.current === acted) acted.settled = true;
      setSettledTick((tick) => tick + 1);
    };
    if (reread) void Promise.resolve(onChangedRef.current()).finally(done);
    else done();
  };

  // One action at a time. A second click lands before React re-renders the disabled button: the
  // ref is the lock.
  const busyRef = useRef(false);
  const begin = (row: KbWorkRow, action: BusyAction): boolean => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy({ id: row.id, action });
    setRowError(row.id, null);
    setNotice(null);
    onNoticeRef.current(null);
    actedOn.current = { id: row.id, index: Math.max(0, listedIds.indexOf(row.id)) };
    return true;
  };
  const end = () => {
    busyRef.current = false;
    setBusy(null);
  };

  const act = async (row: KbWorkRow, action: RowAction) => {
    if (!begin(row, action)) return;
    let changed = false;
    try {
      if (action === 'unhide') {
        const result = await kbService.unhide(row.id);
        if (result.outcome === 'unsupported') {
          setApproveInstead(row);
          return;
        }
        changed = true;
        if (result.approved !== null) {
          patchRow(row.id, { status: result.approved ? 'approved' : 'pending' });
        } else {
          // The server restored what hiding recorded but did not say what: read the row.
          await rereadRow(row.id);
        }
      } else {
        let rejectedAt: string | null = null;
        if (action === 'approve' || action === 'restore') await kbService.approve(row.id);
        else if (action === 'reject')
          // The date the purge counts from — the server's, as the KB list uses it.
          rejectedAt =
            (await kbService.reject(row.id)).data?.rejectedAt ?? new Date().toISOString();
        else await kbService.hide(row.id);
        changed = true;
        patchRow(row.id, {
          status: STATUS_AFTER[action],
          rejectedAt: action === 'reject' ? rejectedAt : null,
        });
      }
    } catch (err) {
      setRowError(row.id, `${ACTION_FAILED[action]}: ${getApiErrorMessage(err) ?? 'try again.'}`);
      // A refused write can still mean the entry moved on (someone else decided it, or merged
      // it): read the row as it is now rather than keep showing what it was.
      changed = true;
      try {
        await rereadRow(row.id);
      } catch {
        // The error above already says the action failed; the report re-read follows.
      }
    } finally {
      end();
      settle(changed);
    }
  };

  const editLock = useRef(false);
  const startEdit = async (row: KbWorkRow) => {
    if (editLock.current) return;
    editLock.current = true;
    setEditLoading(row.id);
    setRowError(row.id, null);
    setNotice(null);
    onNoticeRef.current(null);
    try {
      // The editor works on the FULL entry (the rows carry a cut of it).
      const response = await kbService.getById(row.id);
      setEditing(response.data);
    } catch (err) {
      setRowError(row.id, `Could not open the editor: ${getApiErrorMessage(err) ?? 'try again.'}`);
    } finally {
      editLock.current = false;
      setEditLoading(null);
    }
  };

  const move = async (row: KbWorkRow, target: KbMoveTarget) => {
    if (!begin(row, 'move')) return;
    const ref = kbRef(target.casePublicId, target.caseId);
    let reread = false;
    let moved = false;
    try {
      const result = await kbConsolidationService.attachToCase(target.caseId, [row.id]);
      if (result.outcome === 'unsupported') {
        setRowError(row.id, 'Moving an entry into a case is not available on this server yet.');
        return;
      }
      reread = true;
      if (result.outcome === 'refused') {
        setRowError(row.id, `Not moved into case ${ref}: ${refusalText(ATTACH_REFUSED, result)}`);
        return;
      }
      if (!result.attached.includes(row.id)) {
        setRowError(row.id, `Not moved into case ${ref}: the server did not attach it.`);
        return;
      }
      moved = true;
      patchRow(row.id, { caseId: target.caseId, casePublicId: target.casePublicId });
      setNotice({ text: `Moved into case ${ref}.`, variant: 'success' });
    } catch (err) {
      setRowError(row.id, `Not moved into case ${ref}: ${getApiErrorMessage(err) ?? 'try again.'}`);
    } finally {
      end();
      settle(reread, moved ? undefined : 'move');
    }
  };

  const detach = async (row: KbWorkRow) => {
    if (!caseContext || !begin(row, 'detach')) return;
    const ref = kbRef(caseContext.casePublicId, caseContext.caseId);
    let reread = false;
    let removed = false;
    try {
      const result = await kbConsolidationService.detachFromCase(caseContext.caseId, [row.id]);
      if (result.outcome === 'unsupported') {
        setRowError(
          row.id,
          'Taking one entry out of a case is not available on this server yet — Unmerge undoes the whole case.'
        );
        return;
      }
      reread = true;
      if (result.outcome === 'refused') {
        setRowError(row.id, `Not removed from case ${ref}: ${refusalText(DETACH_REFUSED, result)}`);
        return;
      }
      if (result.detached === null) {
        // The server did not say what it took out: the row says it, read as it is now.
        const now = await rereadRow(row.id);
        if (now?.caseId === null) {
          removed = true;
          setNotice({ text: `Removed from case ${ref}.`, variant: 'success' });
        } else if (now)
          setRowError(row.id, `Not removed from case ${ref}: it is still in the case.`);
      } else if (result.detached.includes(row.id)) {
        removed = true;
        patchRow(row.id, { caseId: null, casePublicId: null, status: 'pending' });
        setNotice({
          text: `Removed from case ${ref} — it is on its own again, pending review.`,
          variant: 'success',
        });
      } else {
        setRowError(row.id, `Not removed from case ${ref}: the server did not remove it.`);
      }
    } catch (err) {
      setRowError(
        row.id,
        `Not removed from case ${ref}: ${getApiErrorMessage(err) ?? 'try again.'}`
      );
    } finally {
      end();
      settle(reread, removed ? undefined : 'detach');
    }
  };

  const unmerge = async (row: KbWorkRow) => {
    if (!begin(row, 'unmerge')) return;
    try {
      const outcome = await runCaseAction({ id: row.id }, 'unmerge', () => ({
        selectedId: null,
        selectedCaseId: null,
        say: () => {},
        close: () => {},
        refetch: async () => {
          await onChangedRef.current();
        },
      }));
      // The case — and this list with it — goes away: the page says what happened.
      onNoticeRef.current({
        text: `${outcome.title}. ${outcome.description}`,
        variant:
          outcome.variant === 'error' ? 'danger' : outcome.variant === 'info' ? 'info' : 'success',
      });
    } finally {
      end();
      // runCaseAction re-read the report itself.
      settle(false);
    }
  };

  const loadFailed = loadError && (
    <Alert variant="danger">
      <span className="mr-2">{loadError}</span>
      <Button size="sm" variant="outline" onClick={() => void load()}>
        Try again
      </Button>
    </Alert>
  );

  if (unsupported) {
    return (
      <p className="text-sm text-muted-foreground">
        This server cannot list these entries yet — open them from the knowledge base.
      </p>
    );
  }
  if (rows === null) {
    return loadError ? (
      loadFailed
    ) : (
      <div className="flex justify-center py-4" role="status" aria-busy="true">
        <Spinner />
      </div>
    );
  }

  const caseId = caseContext?.caseId ?? null;
  // The server's count of LIVE members; none on an older backend ⇒ no number is claimed.
  const memberCount = caseContext?.memberCount;
  const missing = loadedKey === visibleKey ? visibleIds.length - listedIds.length : 0;
  const caseRef = caseContext ? kbRef(caseContext.casePublicId, caseContext.caseId) : '';

  return (
    <div className="space-y-2">
      {loadFailed}
      {loadedKey !== visibleKey && !loadError && (
        // New ids (another page, a re-read) are being read: say so — the rows shown are only
        // those already read, never an empty list that looks final.
        <div className="flex justify-center py-2" role="status" aria-busy="true">
          <Spinner />
        </div>
      )}
      {notice && !onListNotice && (
        <div role="status">
          <Alert variant={notice.variant}>{notice.text}</Alert>
        </div>
      )}
      <ul ref={listRef} tabIndex={-1} className="space-y-2 outline-none" aria-label={label}>
        {listedIds.map((id) => {
          const row = rows.get(id) as KbWorkRow;
          return (
            <KbWorkRowItem
              key={row.id}
              row={row}
              reason={reasons?.get(row.id)}
              caseId={caseId}
              lastMember={caseContext?.memberCount === 1}
              busy={busy}
              editLoading={editLoading === row.id}
              error={rowErrors[row.id]}
              orgCode={orgCode}
              onAct={(action) => void act(row, action)}
              onEdit={() => void startEdit(row)}
              onMove={() => setMoving(row)}
              onDetach={() => setDetaching(row)}
              onUnmerge={() => setUnmerging(row)}
            />
          );
        })}
      </ul>
      {missing > 0 && (
        <p className="text-xs text-muted-foreground">
          {missing === 1 ? '1 entry is' : `${missing} entries are`} not shown — removed meanwhile,
          or not visible to you.
        </p>
      )}
      {ids.length > shown && (
        <Button size="sm" variant="ghost" onClick={() => setShown((count) => count + pageSize)}>
          Show {Math.min(pageSize, ids.length - shown)} more of {ids.length - shown}
        </Button>
      )}

      <KBEntryEditDialog
        entry={editing}
        detailLoaded
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          const qa = saved.typeData;
          patchRow(saved.id, {
            title: saved.title,
            ...(typeof qa?.question === 'string' ? { question: qa.question } : {}),
            ...(typeof qa?.answer === 'string' ? { answer: qa.answer } : {}),
          });
          setEditing(null);
          void onChangedRef.current();
        }}
      />
      <KbMoveToCaseDialog
        entry={moving}
        entryTitle={moving ? headline(moving) : ''}
        departmentIds={departmentIds}
        onClose={() => setMoving(null)}
        onConfirm={(target) => {
          const row = moving;
          setMoving(null);
          if (row) void move(row, target);
        }}
      />
      <ConfirmDialog
        open={detaching !== null}
        onOpenChange={(open) => {
          if (!open) setDetaching(null);
        }}
        onConfirm={() => {
          if (detaching) void detach(detaching);
        }}
        title={`Remove this entry from case ${caseRef}?`}
        description="It comes back on its own as Pending, for review. The case stays, with its answer and its other entries."
        confirmText="Remove from case"
        variant="warning"
      />
      <ConfirmDialog
        open={unmerging !== null}
        onOpenChange={(open) => {
          if (!open) setUnmerging(null);
        }}
        onConfirm={() => {
          if (unmerging) void unmerge(unmerging);
        }}
        title="Unmerge this case?"
        description={`This undoes the merge: the case entry is removed and ${
          unmerging !== null && memberCount !== undefined && memberCount > 0
            ? `its ${memberCount} original ${memberCount === 1 ? 'entry comes' : 'entries come'}`
            : 'its original entries come'
        } back on their own. To take out one entry and keep the case, use Remove from case on it.`}
        confirmText="Unmerge"
        variant="warning"
      />
      <ConfirmDialog
        open={approveInstead !== null}
        onOpenChange={(open) => {
          if (!open) setApproveInstead(null);
        }}
        onConfirm={() => {
          if (approveInstead) void act(approveInstead, 'approve');
        }}
        title="Unhide is not available on this server yet"
        description="The entry was not changed. This server can show a hidden entry again only by approving it — which also lets the AI use it in answers."
        confirmText="Approve instead"
        variant="warning"
      />
    </div>
  );
};
