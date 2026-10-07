/**
 * Settings → System → Bounce repair. Pinned: nothing writes before a confirm, the writes send
 * exactly what the backend writes on, every answer reads true on screen (nothing, partial, more
 * remaining, failed, not yet deployed, an older backend missing fields), and a fused conversation
 * is split only after its own check and confirm.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { BounceRepairResult, FusedSplitResult } from '@/services/system.service';

// Plain functions swapped per test: a rejection from a module-level vi.fn fails the run in
// vitest 4 even when the component catches it.
let check: () => Promise<unknown>;
let apply: () => Promise<unknown>;
let splitCheck: (id: number) => Promise<unknown>;
let splitApply: (id: number) => Promise<unknown>;
const calls: string[] = [];

vi.mock('@/services/system.service', () => ({
  default: {
    checkBounceRepair: () => {
      calls.push('check');
      return check();
    },
    applyBounceRepair: () => {
      calls.push('apply');
      return apply();
    },
    checkFusedSplit: (id: number) => {
      calls.push(`split-check:${id}`);
      return splitCheck(id);
    },
    applyFusedSplit: (id: number) => {
      calls.push(`split-apply:${id}`);
      return splitApply(id);
    },
  },
}));

let workspace: number | null = 67;
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: { selectedOrganizationId: number | null }) => unknown) =>
    select({ selectedOrganizationId: workspace }),
}));

const { BounceRepairSection } = await import('../BounceRepairSection');

const result = (over: Partial<BounceRepairResult> = {}): BounceRepairResult => ({
  applied: false,
  organizationId: 67,
  limit: 500,
  stranded: { found: 12, moved: 0, queued: 0, truncated: false, samples: [] },
  marked: { found: 391, marked: 0, recomputed: 0, truncated: false },
  bounceOnly: {
    found: 28,
    refiled: 0,
    truncated: false,
    samples: [{ id: 41548, publicId: 'SUP-15597', subject: 'Deuspower - Ordine 402538' }],
  },
  fused: {
    found: 1,
    truncated: false,
    conversations: [
      { id: 38522, publicId: 'SUP-12829', subject: 'Delivery Status Notification (Failure)', correspondents: 237, bounces: 391 },
    ],
  },
  failed: null,
  ...over,
});
const ok = (data: unknown) => Promise.resolve({ success: true, data });
const notFound = () => Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));

beforeEach(() => {
  calls.length = 0;
  workspace = 67;
  check = () => ok(result());
  apply = () => ok(result({ applied: true, stranded: { found: 12, moved: 12, queued: 5, truncated: false, samples: [] }, bounceOnly: { found: 28, refiled: 28, truncated: false, samples: [] } }));
  splitCheck = () =>
    ok({
      applied: false,
      conversationId: 38522,
      splittable: true,
      keeps: { correspondent: 'first@buyer.example', messages: 3 },
      moves: [
        { correspondent: 'second@buyer.example', messages: 2, startsAs: 'open' },
        { correspondent: 'third@buyer.example', messages: 2, startsAs: 'open' },
      ],
      unattributedMessages: 391,
      retyped: [{ eventId: 9, correspondent: 'second@buyer.example', via: 'body-email-label' }],
    } satisfies FusedSplitResult);
  splitApply = () =>
    ok({ applied: true, conversationId: 38522, splittable: true, keeps: null, moves: [], unattributedMessages: 0, createdConversationIds: [1, 2] });
});
afterEach(cleanup);

const runCheck = async () => {
  fireEvent.click(screen.getByRole('button', { name: /^Check$/ }));
  await waitFor(() => expect(calls).toContain('check'));
};

describe('Bounce repair', () => {
  it('checks without writing, and lists every finding', async () => {
    render(<BounceRepairSection />);
    await runCheck();
    expect(await screen.findByText(/12 messages/)).toBeInTheDocument();
    expect(screen.getByText(/28 open conversations/)).toBeInTheDocument();
    expect(screen.getByText(/stored before bounces were recognised/)).toBeInTheDocument();
    expect(screen.getByText(/SUP-15597 — Deuspower - Ordine 402538/)).toBeInTheDocument();
    expect(screen.getByText(/237 customers and 391 bounces/)).toBeInTheDocument();
    expect(calls).toEqual(['check']);
  });

  it('writes only after the confirm', async () => {
    render(<BounceRepairSection />);
    await runCheck();
    fireEvent.click(await screen.findByRole('button', { name: /^Repair$/ }));
    expect(calls).toEqual(['check']); // the dialog is open; nothing written yet
    const dialogRepair = await screen.findAllByRole('button', { name: /^Repair$/ });
    fireEvent.click(dialogRepair[dialogRepair.length - 1]);
    await waitFor(() => expect(calls).toEqual(['check', 'apply']));
    expect(await screen.findByText(/Moved 12 messages \(5 queued for processing\), marked 0 bounces and filed away 28 conversations\./)).toBeInTheDocument();
  });

  it('says so when there is nothing to repair', async () => {
    check = () =>
      ok(result({ stranded: { found: 0, moved: 0, queued: 0, truncated: false, samples: [] }, marked: { found: 0, marked: 0, recomputed: 0, truncated: false }, bounceOnly: { found: 0, refiled: 0, truncated: false, samples: [] }, fused: { found: 0, truncated: false, conversations: [] } }));
    render(<BounceRepairSection />);
    await runCheck();
    expect(await screen.findByText('Nothing to repair in this workspace.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Repair$/ })).not.toBeInTheDocument();
  });

  it('says "at least" and "more remain" when the check hit its limit', async () => {
    check = () => ok(result({ stranded: { found: 500, moved: 0, queued: 0, truncated: true, samples: [] } }));
    render(<BounceRepairSection />);
    await runCheck();
    expect(await screen.findByText(/At least/)).toBeInTheDocument();
    expect(screen.getByText(/more remain/)).toBeInTheDocument();
  });

  it('reports a part-way failure with what it did do', async () => {
    apply = () =>
      ok(result({ applied: true, stranded: { found: 12, moved: 7, queued: 2, truncated: false, samples: [] }, bounceOnly: { found: 28, refiled: 0, truncated: false, samples: [] }, failed: { step: 'refile bounce-only', error: 'boom' } }));
    render(<BounceRepairSection />);
    await runCheck();
    fireEvent.click(await screen.findByRole('button', { name: /^Repair$/ }));
    const buttons = await screen.findAllByRole('button', { name: /^Repair$/ });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(await screen.findByText(/Stopped at “refile bounce-only”: boom\. Moved 7 messages/)).toBeInTheDocument();
  });

  it('says the server does not have it yet on a 404', async () => {
    check = notFound;
    render(<BounceRepairSection />);
    await runCheck();
    expect(await screen.findByText(/arrives with the next backend release/)).toBeInTheDocument();
  });

  it('tolerates an older backend answer with missing fields', async () => {
    check = () => ok({ applied: false, stranded: { found: 3 } });
    render(<BounceRepairSection />);
    await runCheck();
    expect(await screen.findByText(/3 messages/)).toBeInTheDocument();
  });

  it('splits a fused conversation only after its own check and confirm', async () => {
    render(<BounceRepairSection />);
    await runCheck();
    fireEvent.click(await screen.findByRole('button', { name: /Check split/ }));
    expect(await screen.findByText(/first@buyer\.example keeps this conversation/)).toBeInTheDocument();
    expect(screen.getByText(/391 messages \(bounces/)).toBeInTheDocument();
    // In the board's own words: an open move starts as "Open" — and every one lands in the inbox.
    expect(screen.getByText(/The new conversations start 2 as “Open”\./)).toBeInTheDocument();
    expect(screen.getByText(/1 message stored as our own reply names a customer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Split into 3 conversations/ }));
    expect(calls).toEqual(['check', 'split-check:38522']);
    fireEvent.click(await screen.findByRole('button', { name: /^Split$/ }));
    await waitFor(() => expect(calls).toEqual(['check', 'split-check:38522', 'split-apply:38522']));
    expect(await screen.findByText(/Separated — 2 new conversations/)).toBeInTheDocument();
  });

  it('forgets a check when the workspace changes', async () => {
    const { rerender } = render(<BounceRepairSection />);
    await runCheck();
    expect(await screen.findByText(/12 messages/)).toBeInTheDocument();
    workspace = 68;
    rerender(<BounceRepairSection />);
    expect(screen.queryByText(/12 messages/)).not.toBeInTheDocument();
  });
});
