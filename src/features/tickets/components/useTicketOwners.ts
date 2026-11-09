import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';
import { assignmentService } from '@/services/assignment.service';

export type OwnerOption = { value: string; label: string };

/** How long Create waits for the owner list before going ahead unassigned. */
export const OWNERS_WAIT_MS = 10_000;

/**
 * The people who can own a new ticket, for the department they were read for: another
 * department's are never offered or sent, and Create waits for the current one's (else the creator
 * went as owner before the list could show they are not assignable — a global admin, #648).
 *
 * `departmentId`: `null` = not known yet (nothing is read); `''` = no department (a thread with
 * none — the whole roster, as Create ticket offered before); otherwise that department's people.
 */
export const useTicketOwners = (departmentId: string | null) => {
  const [list, setList] = useState<{ departmentId: string; options: OwnerOption[] } | null>(null);

  useEffect(() => {
    if (departmentId === null) return;
    let live = true;
    // Nobody can be checked as an owner: it goes unassigned rather than to an unchecked one.
    const unassigned = () => setList({ departmentId, options: [] });
    // Create waits for this list; a request that never answers (no client timeout) must not
    // leave it disabled for good.
    const timer = setTimeout(() => {
      if (!live) return;
      logger.error('New ticket: owners did not load in time');
      unassigned();
    }, OWNERS_WAIT_MS);
    const request =
      departmentId === ''
        ? assignmentService.getAssignableUsers()
        : assignmentService.getAssignableUsers(undefined, Number(departmentId));
    request
      .then((rows) => {
        if (!live) return;
        clearTimeout(timer);
        // The roster comes back whole, flagged: `eligible: false` is someone outside this
        // department (another department's people were offered for HR, staging 2026-10-20).
        // Unflagged = an older backend that sent only assignable people.
        const options = rows
          .filter((row) => row.eligible !== false)
          .map((row) => ({
            value: String(row.id),
            label: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || row.email,
          }));
        setList({ departmentId, options });
      })
      .catch((err: unknown) => {
        if (!live) return;
        clearTimeout(timer);
        logger.error('New ticket: owners failed', err);
        unassigned();
      });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [departmentId]);

  const loaded = departmentId !== null && list !== null && list.departmentId === departmentId;
  return { owners: loaded ? list.options : [], ownersLoaded: loaded };
};
