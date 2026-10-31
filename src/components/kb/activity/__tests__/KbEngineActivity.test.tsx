/**
 * KB engine Stage 1, task F5: Engine activity — the digest line, the findings strip, the engine's
 * changes with Undo, Rate the engine (the Automatic actions sample + ratings calls) and the window
 * rollback (dry run first; owner / admin only). Real services over a mocked transport, so what is
 * asserted is the request each control sends. All data is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';
import type { KbEngineSummary } from '@/services/kbEngine.types';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
const listed = vi.hoisted(() => ({
  entries: [] as KBEntry[],
  calls: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: (params: Record<string, unknown>) => {
        listed.calls.push(params);
        return Promise.resolve({
          success: true,
          data: {
            entries: listed.entries,
            pagination: { page: 1, limit: 10, total: listed.entries.length, totalPages: 1 },
            filters: { status: 'auto_changed', autoChangedStatus: true, statusApplied: true },
          },
        });
      },
    },
  };
});
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
const viewer = vi.hoisted(() => ({
  isOrgAdmin: true,
  teams: [{ id: 1, name: 'Support' }] as Array<{ id: number; name: string }>,
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isOrgAdmin: viewer.isOrgAdmin }),
}));
vi.mock('@/components/kb/page/KbTeamFilter', () => ({ useKbTeams: () => viewer.teams }));

const { KbEngineActivity } = await import('../KbEngineActivity');
const { KBTableView } = await import('../../KBTableView');

type KBEntry = KbServiceModule.KBEntry;
type KbAutoChange = KbServiceModule.KbAutoChange;

const ok = <T,>(data: T) => ({ data: { success: true, data } });

const summary = (overrides: Partial<KbEngineSummary> = {}): KbEngineSummary => ({
  findings: {
    raw_email: 7,
    awaiting_review: 12,
    customer_specific: 5,
    unclassified: 3,
    no_clear_language: 4,
    detached: 2,
  },
  findingsComputedAt: '2026-10-30T02:00:00.000Z',
  questions: { open: 2, olderThan7d: 0 },
  week: {
    actions: 41,
    undone: 0,
    byAction: {
      remove: { applied: 10, undone: 0 },
      hold: { applied: 5, undone: 0 },
      cleanPersonalData: { applied: 6, undone: 0 },
      approveMined: { applied: 12, undone: 0 },
      approveCaptures: { applied: 8, undone: 0 },
      releaseHold: { applied: 0, undone: 0 },
    },
  },
  killed: { all: false, actions: [] },
  ...overrides,
});

const change = (overrides: Partial<KbAutoChange> = {}): KbAutoChange => ({
  action: 'approveMined',
  at: '2026-10-29T09:12:00.000Z',
  confidence: 0.94,
  undo: 'unapprove_mined',
  suggestionId: null,
  undoVersion: 3,
  undoBlocked: null,
  ...overrides,
});

const entry = (id: number, autoChange: KbAutoChange): KBEntry => ({
  id,
  publicId: `KB-${id}`,
  type: 'qa_pair',
  title: `How long does shipping take, case ${id}?`,
  content: 'Example answer.',
  category: 'support',
  departmentId: 1,
  qualityScore: 0.8,
  approved: true,
  hidden: false,
  usageCount: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  autoChange,
});

const actionOverview = (needRated: number, rate: number | null) => ({
  mode: 'shadow',
  threshold: 0.9,
  agreement: {
    decided: 20 - needRated,
    agreed: 0,
    rate,
    atThreshold: { total: 20 - needRated, agreed: 0, rate },
  },
  gate: {
    allowed: false,
    needRated,
    rate,
    reason: needRated > 0 ? 'not_enough_rated' : 'low_agreement',
  },
  wouldAct: 4,
  actedLast90d: 0,
  blockedBy: [],
});

const overviewBody = {
  settings: { remove: { mode: 'shadow', threshold: 0.9 } },
  candidates: {},
  bands: [],
  agreement: {},
  autoRemoved: { last90Days: 0, lastRun: null },
  actions: { remove: actionOverview(6, 0.93) },
  transientSkips: 0,
};

const sampleItem = {
  suggestionId: 71,
  entryId: 501,
  publicId: 'KB-501',
  subject: 'qa',
  question: 'Can I change the delivery address?',
  answer: 'Yes, until the parcel ships.',
  reasons: [],
  note: '',
  confidence: 0.95,
  approved: false,
  personApproved: false,
  capturedVia: null,
  capturedByName: null,
};

const routeGet = (url: string, config?: { params?: Record<string, unknown> }) => {
  if (url === '/api/knowledge-base/auto-actions') return Promise.resolve(ok(overviewBody));
  if (url === '/api/knowledge-base/auto-actions/sample')
    return Promise.resolve(ok({ items: [sampleItem], poolLimited: false, params: config }));
  if (url.endsWith('/versions')) return Promise.resolve(ok({ versions: [] }));
  return Promise.reject(Object.assign(new Error('unexpected'), { status: 404 }));
};

type ActivityProps = Partial<Parameters<typeof KbEngineActivity>[0]> & {
  teams?: Array<{ id: number; name: string }>;
  canRollback?: boolean;
};
const renderActivity = (
  { teams, canRollback, ...props }: ActivityProps = {},
  onChanged = vi.fn()
) => {
  viewer.teams = teams ?? [{ id: 1, name: 'Support' }];
  viewer.isOrgAdmin = canRollback ?? true;
  return render(
    <MemoryRouter>
      <KbEngineActivity
        summary={summary()}
        defaultExpanded={false}
        teamId={1}
        onChanged={onChanged}
        {...props}
      />
    </MemoryRouter>
  );
};

beforeEach(() => {
  api.get.mockImplementation(routeGet);
  api.post.mockResolvedValue(ok({}));
  listed.entries = [];
  listed.calls = [];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('KbEngineActivity', () => {
  it('digest line reads "Engine did 41 things this week, 0 undone, 2 questions for you"', () => {
    renderActivity();
    expect(
      screen.getByText('Engine did 41 things this week, 0 undone, 2 questions for you')
    ).toBeInTheDocument();
  });

  it('collapsed: no request at all; the counts still show', () => {
    renderActivity();
    expect(screen.getByTestId('kb-engine-activity-slot')).toHaveAttribute('data-expanded', 'false');
    expect(screen.getByText('7 raw emails')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
    expect(listed.calls).toHaveLength(0);
  });

  it('findings strip shows every non-zero reason and links to the finding filter', () => {
    renderActivity();
    const expected: Array<[string, string]> = [
      ['7 raw emails', 'raw_email'],
      ['12 awaiting review', 'awaiting_review'],
      ['5 customer-specific', 'customer_specific'],
      ['3 could not classify', 'unclassified'],
      ['4 no clear language', 'no_clear_language'],
      ['2 detached', 'detached'],
    ];
    for (const [text, reason] of expected) {
      const link = screen.getByRole('link', { name: text });
      expect(link).toHaveAttribute(
        'href',
        `/knowledge-base?view=live&status=all&finding=${reason}&departmentId=1#qa_pair`
      );
    }
    expect(screen.getByText(/^as of /)).toBeInTheDocument();
  });

  it('findings never computed: no counts, says so', () => {
    renderActivity({ summary: summary({ findings: null, findingsComputedAt: null }) });
    expect(screen.getByText(/Findings not computed yet/)).toBeInTheDocument();
    expect(screen.queryByText(/raw emails/)).toBeNull();
  });

  it('several teams and none picked: a count opens a team menu', () => {
    renderActivity({
      teamId: undefined,
      teams: [
        { id: 1, name: 'Support' },
        { id: 2, name: 'Sales' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: '7 raw emails: choose a team' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Support')).toBeInTheDocument();
    expect(within(menu).getByText('Sales')).toBeInTheDocument();
  });

  it('rate the engine uses the sample and ratings endpoints and shows progress to 20 at 90%', async () => {
    renderActivity({ defaultExpanded: true });
    const rate = await screen.findByTestId('kb-rate-engine');
    expect(
      await within(rate).findByText('14 of 20 rated · 93% agree (needs 90%)')
    ).toBeInTheDocument();
    expect(
      within(rate).getByText(
        /After 20 ratings at 90 % or better, you can switch this action to Automatic\./
      )
    ).toBeInTheDocument();
    expect(within(rate).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '14');

    fireEvent.click(within(rate).getByRole('button', { name: 'Rate a sample' }));
    fireEvent.click(within(rate).getByRole('button', { name: 'Check a sample' }));
    await within(rate).findByText('Can I change the delivery address?');
    expect(api.get).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/sample', {
      params: { limit: 30, action: 'remove' },
    });
    fireEvent.click(within(rate).getByRole('button', { name: 'Agree' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/ratings', {
        action: 'remove',
        entryId: 501,
        agreed: true,
      })
    );
  });

  it('list rows carry no shadow mark', () => {
    render(
      <MemoryRouter>
        <KBTableView
          entries={[entry(9, change()), entry(10, change({ action: 'remove', undo: 'restore' }))]}
          loading={false}
          canReview
          onView={vi.fn()}
          onApprove={vi.fn()}
          onHide={vi.fn()}
          onUnhide={vi.fn()}
          onReject={vi.fn()}
          onDelete={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(document.body.textContent ?? '').not.toMatch(/shadow|would (remove|approve)/i);
  });

  it('Changed by the engine: actor Engine, one-line reason, Undo by its own kind', async () => {
    listed.entries = [entry(9, change())];
    const onChanged = vi.fn();
    renderActivity({ defaultExpanded: true }, onChanged);
    const row = await screen.findByTestId('kb-engine-change');
    expect(listed.calls[0]).toMatchObject({ status: 'auto_changed', page: 1, limit: 10 });
    expect(within(row).getByText('Engine')).toBeInTheDocument();
    expect(within(row).getByText('Why: the engine was 94% sure')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: /^Un-approve:/ }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/knowledge-base/auto-actions/approved-mined/9/unapprove',
        {}
      )
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('Undo is disabled with the reason when someone changed the entry after the engine', async () => {
    listed.entries = [entry(9, change({ undoBlocked: 'changed_after' }))];
    renderActivity({ defaultExpanded: true });
    const row = await screen.findByTestId('kb-engine-change');
    expect(within(row).getByRole('button', { name: /^Un-approve:/ })).toBeDisabled();
    expect(
      within(row).getByLabelText('Someone changed this entry after the engine — undo by hand.')
    ).toBeInTheDocument();
  });

  it('a removal with a version undoes by version restore; a later person edit is named', async () => {
    listed.entries = [entry(9, change({ action: 'remove', undo: 'restore', undoVersion: 4 }))];
    const { toast } = await import('@/lib/toast');
    api.post.mockRejectedValueOnce(
      Object.assign(new Error('refused'), {
        status: 409,
        data: {
          error: 'Changed later',
          code: 'LATER_CHANGES',
          later: [
            {
              version: 6,
              actorKind: 'person',
              actorUserId: 3,
              engineActionId: null,
              reason: 'edit',
              createdAt: '2026-10-30T10:00:00.000Z',
              snapshot: {},
            },
          ],
        },
      })
    );
    renderActivity({ defaultExpanded: true });
    const row = await screen.findByTestId('kb-engine-change');
    fireEvent.click(within(row).getByRole('button', { name: /^Restore:/ }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/knowledge-base/entries/9/versions/4/restore', {})
    );
    await waitFor(() =>
      expect(vi.mocked(toast.error).mock.calls[0]?.[1]?.description).toMatch(
        /^Changed later by a person on .*\(text edited\)\.$/
      )
    );
  });

  it('Undo is reachable from Changed by the engine after the dialog closes', async () => {
    listed.entries = [entry(9, change())];
    renderActivity({ defaultExpanded: true });
    await screen.findByTestId('kb-engine-change');
    // Open the rollback, run a dry run, open its confirm and cancel it.
    api.post.mockResolvedValueOnce(
      ok({
        dryRun: true,
        matched: 1,
        processed: 1,
        restored: 0,
        entryIds: [9],
        alreadyAtTarget: [],
        skipped: [],
        truncated: false,
        nextAfterEntryId: null,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Roll back a period…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check what would change' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Roll back' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const undo = within(screen.getByTestId('kb-engine-change')).getByRole('button', {
      name: /^Un-approve:/,
    });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/knowledge-base/auto-actions/approved-mined/9/unapprove',
        {}
      )
    );
  });

  it('rollback dry-runs before confirm', async () => {
    api.post.mockImplementation((url: string, body: { dryRun?: boolean }) =>
      url === '/api/knowledge-base/engine/rollback'
        ? Promise.resolve(
            ok({
              dryRun: body.dryRun !== false,
              matched: 5,
              processed: 5,
              restored: body.dryRun === false ? 2 : 0,
              entryIds: [11, 12],
              alreadyAtTarget: [],
              skipped: [
                { entryId: 13, reason: 'changed_after' },
                { entryId: 14, reason: 'needs_own_undo', action: 'auto:remove', actionIds: [5] },
                { entryId: 15, reason: 'merged_into_case' },
              ],
              truncated: false,
              nextAfterEntryId: null,
            })
          )
        : Promise.resolve(ok({}))
    );
    renderActivity({ defaultExpanded: true });
    fireEvent.click(screen.getByRole('button', { name: 'Roll back a period…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check what would change' }));
    const result = await screen.findByTestId('kb-rollback-result');
    const rollbackCalls = () =>
      api.post.mock.calls.filter(([url]) => url === '/api/knowledge-base/engine/rollback');
    expect(rollbackCalls()).toHaveLength(1);
    expect(rollbackCalls()[0][1]).toMatchObject({ dryRun: true, departmentId: 1 });
    expect(result).toHaveTextContent('Rolling back would put 2 back and leave 3 as they are');
    expect(result).toHaveTextContent('A person changed it later');
    expect(result).toHaveTextContent('Has an undo of its own (Removing entries)');
    expect(result).toHaveTextContent('It is merged into a case: undo the merge instead');

    fireEvent.click(within(result).getByRole('button', { name: 'Roll back' }));
    expect(rollbackCalls()).toHaveLength(1); // nothing yet: the confirm comes first
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Roll back' }));
    await waitFor(() => expect(rollbackCalls()).toHaveLength(2));
    expect(rollbackCalls()[1][1]).toMatchObject({ dryRun: false });
    await waitFor(() =>
      expect(screen.getByTestId('kb-rollback-result')).toHaveTextContent('Rolled back: 2 put back')
    );
  });

  it('rollback offers Continue on a truncated page and sends nextAfterEntryId', async () => {
    api.post.mockResolvedValueOnce(
      ok({
        dryRun: true,
        matched: 150,
        processed: 100,
        restored: 0,
        entryIds: [1],
        alreadyAtTarget: [],
        skipped: [],
        truncated: true,
        nextAfterEntryId: 400,
      })
    );
    renderActivity({ defaultExpanded: true });
    fireEvent.click(screen.getByRole('button', { name: 'Roll back a period…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check what would change' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith(
        '/api/knowledge-base/engine/rollback',
        expect.objectContaining({ dryRun: true, afterEntryId: 400 })
      )
    );
  });

  it('rollback refuses a window over 31 days without asking the server', () => {
    renderActivity({ defaultExpanded: true });
    fireEvent.click(screen.getByRole('button', { name: 'Roll back a period…' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-15' } });
    expect(screen.getByText('Pick at most 31 days.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check what would change' })).toBeDisabled();
  });

  it('rollback hidden for agents', () => {
    renderActivity({ defaultExpanded: true, canRollback: false });
    expect(screen.queryByRole('button', { name: 'Roll back a period…' })).toBeNull();
    expect(screen.queryByTestId('kb-engine-rollback')).toBeNull();
  });

  it('names the switched-off actions', () => {
    renderActivity({
      defaultExpanded: true,
      summary: summary({ killed: { all: false, actions: ['remove', 'hold'] } }),
    });
    expect(
      screen.getByText('Switched off: Removing entries, Setting answers aside.')
    ).toBeInTheDocument();
  });
});
