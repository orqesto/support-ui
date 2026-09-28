import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * Bulk "Assign" (prod test-workspace, 2026-09-28): a workspace with no members opened a picker that
 * held only "Choose a person…" and a disabled button, with no word why. Nobody-to-assign and a
 * failed load must each say so; a normal list must not show either sentence.
 */
type AssignableUser = { id: number; firstName: string; lastName: string };
// A plain function, not a vi.fn: here a vi.fn returning the rejection failed the test even though
// the component caught it (the rejection value was reported after every step had passed). Other
// suites use mockRejectedValue without this, so the cause is not established — only the workaround.
let answer: () => Promise<AssignableUser[]> = () => Promise.resolve([]);
vi.mock('@/services/assignment.service', () => ({
  assignmentService: { getAssignableUsers: () => answer() },
}));

import { BulkConfirmDialog } from '../BulkConfirmDialog';
import { networkError } from '@/test/apiError';

const EMPTY = /No one in this workspace can be assigned conversations/;
const FAILED = /Could not load the people you can assign/;

const renderAssign = () =>
  render(
    <BulkConfirmDialog
      open
      action="assign"
      preview={{ eligible: [1, 2], refused: [] } as never}
      selectedCount={2}
      running={false}
      onOpenChange={() => undefined}
      onConfirm={() => undefined}
    />
  );

beforeEach(() => {
  answer = () => Promise.resolve([]);
});
afterEach(cleanup);

describe('bulk Assign picker', () => {
  it('says there is nobody to assign when the workspace has no assignable members', async () => {
    answer = () => Promise.resolve([]);
    renderAssign();
    expect(await screen.findByText(EMPTY)).toBeTruthy();
    expect(screen.queryByText(FAILED)).toBeNull();
  });

  it('says the list could not be loaded when the request fails', async () => {
    const failure = await networkError();
    // networkError() is the axios-shaped Error the api-client rejects with.
    answer = () => Promise.reject(failure as Error);
    renderAssign();
    expect(await screen.findByText(FAILED)).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it('says neither when there are people to pick (control)', async () => {
    answer = () => Promise.resolve([{ id: 7, firstName: 'Ada', lastName: 'Agent' }]);
    renderAssign();
    expect(await screen.findByRole('option', { name: 'Ada Agent' })).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.queryByText(FAILED)).toBeNull();
  });
});
