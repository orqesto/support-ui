/**
 * Settings → System → Knowledge base repair. The two repairs existed only as hand-written fetches
 * in a browser console (taco DeusPower, 2026-10-05) — a step only we could take. Pinned here:
 * nothing writes before a confirm, the write sends exactly `apply: true`, and every answer the
 * backend can give reads true on screen (none, partial, more-remaining, failed, not-yet-deployed).
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import type {
  KbDocumentRepairResult,
  KbHistorySweepResponse,
  KbSweepSource,
} from '@/services/system.service';

// Plain functions swapped per test: a rejection from a module-level vi.fn fails the run in
// vitest 4 even when the component catches it.
let check: () => Promise<unknown>;
let apply: () => Promise<unknown>;
let list: () => Promise<unknown>;
let request: (id: number) => Promise<unknown>;
const calls: string[] = [];

vi.mock('@/services/system.service', () => ({
  default: {
    checkKbDocumentRepair: () => {
      calls.push('check');
      return check();
    },
    applyKbDocumentRepair: () => {
      calls.push('apply');
      return apply();
    },
    listKbHistorySweep: () => {
      calls.push('list');
      return list();
    },
    requestKbHistorySweep: (id: number) => {
      calls.push(`request:${id}`);
      return request(id);
    },
  },
}));

// The captured-question block (2026-10-07) lists workspaces on mount — never a real request.
vi.mock('@/services/organization.service', () => ({
  organizationService: { getAllPages: () => new Promise(() => undefined) },
}));
let workspace: number | null = 67;
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: { selectedOrganizationId: number | null }) => unknown) =>
    select({ selectedOrganizationId: workspace }),
}));

const { KbRepairSection } = await import('../KbRepairSection');

const repair = (over: Partial<KbDocumentRepairResult> = {}): KbDocumentRepairResult => ({
  applied: false,
  organizationId: 67,
  scanned: 1253,
  matched: { unvalidated_extraction: 1234, transaction_record: 0 },
  rejected: { unvalidated_extraction: 0, transaction_record: 0 },
  truncated: false,
  failed: null,
  samples: [
    {
      id: 1,
      title: 'invoice-9.pdf',
      reason: 'unvalidated_extraction',
      why: 'filed by text extraction, never validated',
    },
  ],
  ...over,
});

const source = (over: Partial<KbSweepSource> = {}): KbSweepSource => ({
  id: 68,
  name: 'Gmail-support@deuspower.com',
  type: 'gmail',
  lastSweptAt: '2026-09-16T10:40:00Z',
  enabled: true,
  state: 'swept',
  inProgress: false,
  ...over,
});

const sweep = (over: Partial<KbHistorySweepResponse> = {}): KbHistorySweepResponse => ({
  applied: false,
  organizationId: 67,
  cleared: 0,
  resweeps: 0,
  restarted: 0,
  notStarted: 0,
  gmailInProgress: 0,
  disabled: 0,
  sources: [source()],
  ...over,
});

const ok = <T,>(data: T) => Promise.resolve({ success: true, data });

beforeEach(() => {
  workspace = 67;
  calls.length = 0;
  check = () => ok(repair());
  apply = () =>
    ok(
      repair({ applied: true, rejected: { unvalidated_extraction: 1234, transaction_record: 0 } })
    );
  list = () => ok(sweep());
  request = () => ok(sweep({ applied: true, cleared: 1, resweeps: 1 }));
});
afterEach(cleanup);

const clickCheck = () => fireEvent.click(screen.getByRole('button', { name: /^Check$/ }));

describe('Documents filed without validation', () => {
  it('a check only reads, names the count, and nothing is rejected before the confirm', async () => {
    render(<KbRepairSection />);
    clickCheck();
    expect(
      await screen.findByText(/to reject: 1,234 filed without validation, 0 transaction records/)
    ).toBeInTheDocument();
    expect(screen.getByText(/invoice-9\.pdf/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Reject 1,234 documents/ }));
    // The dialog is open; the write has not happened.
    const dialog = await screen.findByRole('dialog');
    expect(calls).toEqual(['check']);

    fireEvent.click(within(dialog).getByRole('button', { name: /^Reject$/ }));
    expect(await screen.findByText(/Rejected 1,234 documents\./)).toBeInTheDocument();
    expect(calls).toEqual(['check', 'apply']);
  });

  it('cancelling the confirm writes nothing', async () => {
    render(<KbRepairSection />);
    clickCheck();
    fireEvent.click(await screen.findByRole('button', { name: /Reject 1,234 documents/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /Cancel/ })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls).toEqual(['check']);
  });

  it('nothing to clean up says so, and offers no Reject', async () => {
    check = () =>
      ok(repair({ matched: { unvalidated_extraction: 0, transaction_record: 0 }, samples: [] }));
    render(<KbRepairSection />);
    clickCheck();
    expect(
      await screen.findByText(/Nothing to clean up — 1,253 documents checked/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reject/ })).not.toBeInTheDocument();
  });

  it('a check cut by its limit says "at least" and that more remain', async () => {
    check = () =>
      ok(
        repair({
          truncated: true,
          matched: { unvalidated_extraction: 1000, transaction_record: 0 },
        })
      );
    render(<KbRepairSection />);
    clickCheck();
    expect(await screen.findByText(/At least/)).toBeInTheDocument();
    expect(screen.getByText(/more remain/)).toBeInTheDocument();
  });

  it('an apply that stopped part-way says what it did reject, not "done"', async () => {
    apply = () =>
      ok(
        repair({
          applied: true,
          rejected: { unvalidated_extraction: 3, transaction_record: 0 },
          failed: { id: 4, error: 'deadlock detected' },
        })
      );
    render(<KbRepairSection />);
    clickCheck();
    fireEvent.click(await screen.findByRole('button', { name: /Reject 1,234 documents/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /^Reject$/ })
    );
    expect(
      await screen.findByText(/Stopped after rejecting 3 documents: deadlock detected/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Rejected /)).not.toBeInTheDocument();
  });

  it('an apply that left more says to check again', async () => {
    apply = () =>
      ok(
        repair({
          applied: true,
          truncated: true,
          rejected: { unvalidated_extraction: 1000, transaction_record: 0 },
        })
      );
    render(<KbRepairSection />);
    clickCheck();
    fireEvent.click(await screen.findByRole('button', { name: /Reject 1,234 documents/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /^Reject$/ })
    );
    expect(
      await screen.findByText(/Rejected 1,000 documents\. More remain — check again/)
    ).toBeInTheDocument();
  });

  it('a server error is shown as an error, and a missing endpoint names the release', async () => {
    check = () =>
      Promise.reject(
        Object.assign(new Error('Repair failed before listing anything: boom'), { status: 500 })
      );
    render(<KbRepairSection />);
    clickCheck();
    expect(
      await screen.findByText(/Repair failed before listing anything: boom/)
    ).toBeInTheDocument();

    cleanup();
    check = () => Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
    render(<KbRepairSection />);
    clickCheck();
    expect(await screen.findByText(/arrives with the next backend release/)).toBeInTheDocument();
  });
});

describe('switching workspace', () => {
  it('drops what was read in the previous workspace — its count never sits next to Reject', async () => {
    const { rerender } = render(<KbRepairSection />);
    clickCheck();
    expect(
      await screen.findByRole('button', { name: /Reject 1,234 documents/ })
    ).toBeInTheDocument();

    workspace = 3;
    rerender(<KbRepairSection />);
    expect(screen.queryByRole('button', { name: /Reject/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/to reject/)).not.toBeInTheDocument();
  });
});

describe('Re-read mailbox history', () => {
  const show = () => fireEvent.click(screen.getByRole('button', { name: /Show mailboxes/ }));

  it('lists each mailbox with where its history read stands; only a request that changes something is offered', async () => {
    list = () =>
      ok(
        sweep({
          sources: [
            source(),
            source({
              id: 2,
              name: 'imap-a',
              type: 'email',
              state: 'in_progress',
              lastSweptAt: null,
            }),
            source({
              id: 3,
              name: 'imap-b',
              type: 'email',
              state: 'not_started',
              lastSweptAt: null,
            }),
            source({ id: 4, name: 'gmail-b', state: 'gmail_pending', lastSweptAt: null }),
            source({ id: 5, name: 'off', enabled: false, state: 'disabled' }),
          ],
        })
      );
    render(<KbRepairSection />);
    show();
    expect(await screen.findByText(/^History read \d/)).toBeInTheDocument();
    expect(screen.getByText(/Reading its history now/)).toBeInTheDocument();
    expect(screen.getByText(/the next check starts it/)).toBeInTheDocument();
    expect(screen.getByText(/the next check continues it/)).toBeInTheDocument();
    expect(screen.getByText(/Switched off/)).toBeInTheDocument();
    // swept, in progress, disabled: 3 buttons. Not started / Gmail pending: the next check does it anyway.
    expect(screen.getAllByRole('button', { name: /Re-read history/ })).toHaveLength(3);
    expect(calls).toEqual(['list']);
  });

  it('asks only the mailbox chosen, after a confirm, then reads the list again', async () => {
    let listed = 0;
    list = () => {
      listed += 1;
      return ok(
        sweep({
          sources:
            listed === 1
              ? [source(), source({ id: 9, name: 'other' })]
              : [
                  source({ state: 'gmail_pending', lastSweptAt: null }),
                  source({ id: 9, name: 'other' }),
                ],
        })
      );
    };
    render(<KbRepairSection />);
    show();
    const rows = await screen.findAllByRole('button', { name: /Re-read history/ });
    fireEvent.click(rows[0]);
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/fetches its history from before the knowledge-base cutoff/)
    ).toBeInTheDocument();
    expect(calls).toEqual(['list']);

    fireEvent.click(within(dialog).getByRole('button', { name: /Re-read history/ }));
    expect(
      await screen.findByText(
        /Gmail-support@deuspower\.com reads its history again on its next check/
      )
    ).toBeInTheDocument();
    expect(calls).toEqual(['list', 'request:68', 'list']);
    // The other mailbox is still listed, and the asked one shows its state AFTER the request.
    expect(screen.getByText('other')).toBeInTheDocument();
    expect(screen.getByText(/the next check continues it/)).toBeInTheDocument();
  });

  it('says what a request did from the counts: restarted, switched off, nothing', async () => {
    const { sweepResultText } = await import('../KbRepairSection');
    const base = { cleared: 1, resweeps: 0, restarted: 0, disabled: 0 };
    expect(sweepResultText(source(), { ...base, restarted: 1 })).toMatch(
      /again from the beginning/
    );
    expect(sweepResultText(source(), { ...base, disabled: 1 })).toMatch(/switched off/);
    expect(sweepResultText(source(), { ...base, cleared: 0 })).toMatch(/Nothing changed/);
  });

  it('a workspace with no KB mailboxes says so', async () => {
    list = () => ok(sweep({ sources: [] }));
    render(<KbRepairSection />);
    show();
    expect(await screen.findByText(/no knowledge-base mailboxes/)).toBeInTheDocument();
  });
});
