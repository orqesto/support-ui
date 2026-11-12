import { useState, useEffect, useCallback, useRef } from 'react';
import { Select } from '@/components/ui/Select';
import { assignmentService, type AssignableUser } from '@/services/assignment.service';
import { logger } from '@/lib/logger';
import { userFullName } from '@/lib/userName';

type AssignmentSelectProps = {
  type: 'message' | 'ticket' | 'thread';
  itemId: number | string; // threadId can be string
  currentAssigneeId?: number | null;
  skillFilter?: { key: string; value: string };
  /**
   * Wave 5 C-4: scope the picker to users in this dept. The BE enforces the
   * same scope on assignment, so callers should pass the item's dept here to
   * avoid the user picking someone who'll be rejected. Pass undefined to show
   * the full org list (used for unscoped contexts).
   */
  departmentId?: number | null;
  /**
   * Called after a successful assign. Receives the picked user, or null when
   * unassigning. Lets callers optimistically update local state without a
   * full list refetch. Optional arg kept backward-compatible — existing
   * callers using `() => void` can ignore it.
   */
  onAssign?: (picked: AssignableUser | null) => void;
  className?: string;
  /** Compact 'value' look for the message detail meta row; default elsewhere. */
  variant?: 'default' | 'value';
  /** Phones only: the menu as a bottom sheet (Select `mobileSheet`). Off by default. */
  mobileSheet?: boolean;
  /**
   * Called with the assign before it runs; the assign happens only if the caller calls `run`
   * (a confirm first — thread presence, "Anna is writing a reply — assign anyway?"). Absent:
   * the assign runs at once.
   */
  beforeChange?: (run: () => void) => void;
  /**
   * Put the focus in the assignee box once the list has loaded — for a picker opened from a
   * button (a row's Claim), where a keyboard user otherwise stays on the button and cannot Tab
   * into the picker (it is portaled to the end of the page). Waits for the first load (the box
   * is disabled until then and a disabled box takes no focus), and focuses once — a later refetch
   * does not pull the focus back, nor does a load that ends after the agent moved the focus away.
   * Skipped on a device with no fine pointer at all (a phone, a tablet on its own): there the focus
   * would only pop the on-screen keyboard over the list. A tablet with a trackpad keyboard has a
   * fine pointer too and keeps the focus.
   */
  autoFocus?: boolean;
};

export const AssignmentSelect = ({
  type,
  itemId,
  currentAssigneeId,
  skillFilter,
  departmentId,
  onAssign,
  className,
  variant = 'default',
  mobileSheet = false,
  beforeChange,
  autoFocus = false,
}: AssignmentSelectProps) => {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  // Starts true: the list is fetched on mount, so the box is disabled until the first load ends.
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const autoFocused = useRef(false);
  // Where the focus was when the picker opened (its Claim button, or nothing): the focus moves in
  // only if it is still there — an agent who moved on while the list loaded keeps their place.
  const focusAtOpen = useRef(typeof document === 'undefined' ? null : document.activeElement);
  useEffect(() => {
    if (!autoFocus || loading || autoFocused.current) return;
    autoFocused.current = true;
    const active = document.activeElement;
    if (active !== focusAtOpen.current && active !== document.body) return;
    if (window.matchMedia && !window.matchMedia('(any-pointer: fine)').matches) return;
    boxRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [autoFocus, loading]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await assignmentService.getAssignableUsers(
        skillFilter,
        departmentId ?? undefined
      );
      setUsers(data);
    } catch (error) {
      logger.error('Failed to fetch assignable users:', error);
    } finally {
      setLoading(false);
    }
  }, [skillFilter, departmentId]);

  useEffect(() => {
    fetchUsers().catch((err) => {
      logger.error(err);
    });
  }, [fetchUsers]);

  const handleChange = (value: string) => {
    if (beforeChange) beforeChange(() => void handleAssign(value));
    else void handleAssign(value);
  };

  const handleAssign = async (value: string) => {
    const userId = value === '' ? null : Number.parseInt(value, 10);
    try {
      setAssigning(true);

      if (type === 'message') {
        await assignmentService.assignMessage(itemId as number, userId);
      } else if (type === 'thread') {
        await assignmentService.assignThread(itemId as string, userId);
      } else {
        await assignmentService.assignTicket(itemId as number, userId);
      }
      const picked = userId !== null ? (users.find((user) => user.id === userId) ?? null) : null;
      onAssign?.(picked);
    } catch (error) {
      logger.error('[AssignmentSelect] Failed to assign:', error);
    } finally {
      setAssigning(false);
    }
  };

  const options = [
    { value: '', label: 'Unassigned' },
    ...users.map((user) => {
      // Ineligible = not a member of this item's department (BE also rejects the
      // assign). Show them disabled with a reason rather than hiding them.
      const ineligible = user.eligible === false;
      const base = `${userFullName(user)} (${user.role})`;
      return {
        value: String(user.id),
        label: ineligible ? `${base} — not in this team` : base,
        isDisabled: ineligible,
      };
    }),
  ];

  return (
    // `contents`: no box of its own, so callers lay the Select out exactly as before.
    <div ref={boxRef} className="contents">
      <Select
        className={className}
        variant={variant}
        mobileSheet={mobileSheet}
        value={currentAssigneeId ? String(currentAssigneeId) : ''}
        onChange={handleChange}
        options={options}
        disabled={loading || assigning}
        size="sm"
        aria-label="Assignee"
        placeholder={loading ? 'Loading...' : 'Select assignee'}
        searchable
      />
    </div>
  );
};
