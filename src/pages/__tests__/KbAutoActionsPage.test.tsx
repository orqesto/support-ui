/**
 * Knowledge base → Automatic actions. Renders the real page and services over a mocked transport,
 * so what is asserted is the request each control sends and what the page derives from the
 * overview without refetching:
 * - the preview and the agreement follow the slider (sums over the per-percent counts);
 * - without MANAGE_ORGANIZATION the setting is read-only;
 * - switching to Automatic needs a confirm that names the count, and only then PATCHes;
 * - Agree / Disagree in the sample call accept-with-reject / decline;
 * - Restore calls the restore route after a confirm;
 * - a backend without these routes shows a calm notice, not an error.
 * All data is invented.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
const perms = vi.hoisted(() => ({ canManageOrg: true }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/components/kb/KbQualityCoverage', () => ({
  KbQualityCoverage: () => <div data-testid="quality-coverage" />,
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) => perm !== 'manage_organization' || perms.canManageOrg,
  }),
}));

import { KbAutoActionsPage } from '../KbAutoActionsPage';

const overview = (mode = 'shadow', threshold = 0.9) => ({
  settings: { remove: { mode, threshold } },
  candidates: {
    total: 25,
    byReason: { customer_specific: 12, no_answer: 8, outdated: 5 },
    bySubject: { qa: 21, document: 4 },
    byBand: { lt50: 2, '50to70': 3, '70to80': 10, '80to90': 6, '90to95': 0, gte95: 4, unscored: 3 },
    wouldRemoveAtThreshold: 4,
    personApprovedAtThreshold: 2,
    removableByPercent: [
      { percent: 95, count: 4 },
      { percent: 85, count: 6 },
      { percent: 72, count: 10 },
    ],
  },
  bands: [],
  agreement: {
    decided: 20,
    agreed: 14,
    disagreed: 6,
    byBand: {},
    atThreshold: { agreed: 9, disagreed: 1, total: 10, rate: 0.9 },
    byPercent: [
      { percent: 96, agreed: 9, disagreed: 1 },
      { percent: 80, agreed: 5, disagreed: 5 },
    ],
  },
  autoRemoved: {
    last90Days: 7,
    lastRun: { at: '2026-10-19T02:00:00.000Z', removed: 5, capped: true, via: 'nightly' },
  },
});

const sample = {
  items: [
    {
      suggestionId: 501,
      entryId: 41,
      publicId: 'KB-41',
      subject: 'qa',
      question: 'Can I change the colour of my order from Example Shop?',
      answer: 'Yes, write to us.',
      reasons: ['customer_specific'],
      note: 'Mentions one order only.',
      confidence: 0.93,
      approved: false,
      personApproved: false,
    },
    {
      suggestionId: 502,
      entryId: 42,
      publicId: 'KB-42',
      subject: 'document',
      question: 'Opening hours',
      answer: 'Monday to Friday.',
      reasons: ['outdated'],
      note: '',
      confidence: 0.81,
      approved: false,
      personApproved: false,
    },
  ],
  poolLimited: true,
};

const removed = {
  items: [
    {
      entryId: 77,
      publicId: 'KB-77',
      subject: 'qa',
      question: 'Where is the old warehouse?',
      answer: 'Nowhere now.',
      reasons: ['outdated'],
      confidence: 0.97,
      threshold: 0.9,
      suggestionId: 900,
      removedAt: '2026-10-19T02:00:00.000Z',
      purgeAfter: '2027-01-17T02:00:00.000Z',
      previous: { approved: false, hidden: false },
    },
  ],
  page: 1,
  pageSize: 25,
  total: 1,
};

const ok = (data: unknown) => Promise.resolve({ data: { success: true, data } });

const wireGets = (current = overview()) => {
  api.get.mockImplementation((url: string) => {
    if (url === '/api/knowledge-base/auto-actions') return ok(current);
    if (url === '/api/knowledge-base/auto-actions/sample') return ok(sample);
    if (url === '/api/knowledge-base/auto-actions/removed') return ok(removed);
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <KbAutoActionsPage />
    </MemoryRouter>
  );

const slider = () => screen.getByRole('slider', { name: 'Removal bar, % sure' });
const dialog = () => screen.getByRole('dialog');

beforeEach(() => {
  vi.clearAllMocks();
  perms.canManageOrg = true;
  useAuthStore.setState({ user: null });
  wireGets();
  api.post.mockImplementation(() => ok({ status: 'rejected' }));
  api.patch.mockImplementation((_url: string, body: { remove: unknown }) =>
    ok({ settings: body, startedRun: true })
  );
});
afterEach(cleanup);

describe('Automatic actions page', () => {
  it('previews the count and the agreement at the slider value without refetching', async () => {
    renderPage();
    expect(await screen.findByText('4 entries')).toBeInTheDocument();
    // At 90%: only the 96% row counts → 9 of 10, under the 20-decision floor.
    expect(screen.getByText('9 of 10')).toBeInTheDocument();
    expect(screen.getByText(/Not enough decisions yet/)).toBeInTheDocument();

    fireEvent.change(slider(), { target: { value: '80' } });
    expect(screen.getByText('10 entries')).toBeInTheDocument();
    expect(screen.getByText('14 of 20')).toBeInTheDocument();
    expect(screen.getByText(/\(70%\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Not enough decisions yet/)).not.toBeInTheDocument();

    fireEvent.change(slider(), { target: { value: '72' } });
    expect(screen.getByText('20 entries')).toBeInTheDocument();
    expect(
      api.get.mock.calls.filter(([url]) => url === '/api/knowledge-base/auto-actions')
    ).toHaveLength(1);

    // Reasons read with the review's labels; person-approved, unscored and the last run are shown.
    expect(screen.getByText('only fits one customer: 12')).toBeInTheDocument();
    expect(
      screen.getByText(/2 entries a person approved are above the saved bar/)
    ).toBeInTheDocument();
    expect(screen.getByText(/3 suggestions have no score yet/)).toBeInTheDocument();
    expect(screen.getByTestId('kb-auto-status')).toHaveTextContent(
      /removed 5 entries \(stopped at the per-night limit/
    );
  });

  it('is read-only without MANAGE_ORGANIZATION', async () => {
    perms.canManageOrg = false;
    renderPage();
    await screen.findByText('4 entries');
    expect(slider()).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Automatic' })).not.toBeInTheDocument();
    expect(screen.getByText('Only workspace admins can change this setting.')).toBeInTheDocument();
  });

  it('asks before turning on Automatic, naming the count, and then PATCHes the setting', async () => {
    renderPage();
    await screen.findByText('4 entries');
    fireEvent.click(screen.getByRole('button', { name: 'Automatic' }));
    fireEvent.change(slider(), { target: { value: '85' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      within(dialog()).getByText(/At 85% the next run removes 10 entries now/)
    ).toBeInTheDocument();
    expect(within(dialog()).getByText(/a person approved are never removed/)).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Turn on' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/settings', {
        remove: { mode: 'auto', threshold: 0.85 },
      })
    );
  });

  it('asks again when Automatic is already on and the bar is lowered', async () => {
    wireGets(overview('auto', 0.9));
    renderPage();
    await screen.findByText('4 entries');
    fireEvent.change(slider(), { target: { value: '85' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      within(dialog()).getByText(/At 85% the next run removes 10 entries now/)
    ).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Lower the bar' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/settings', {
        remove: { mode: 'auto', threshold: 0.85 },
      })
    );
  });

  it('raising the bar while Automatic is on removes less, so it saves without a confirm', async () => {
    wireGets(overview('auto', 0.9));
    renderPage();
    await screen.findByText('4 entries');
    fireEvent.change(slider(), { target: { value: '95' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/settings', {
        remove: { mode: 'auto', threshold: 0.95 },
      })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows how many candidates sit in each confidence band, unscored included', async () => {
    renderPage();
    await screen.findByText('4 entries');
    const list = screen.getByRole('list', { name: 'Candidates by confidence' });
    const rows = within(list)
      .getAllByRole('listitem')
      .map((row) => row.textContent);
    expect(rows).toEqual([
      'Under 50%2',
      '50–70%3',
      '70–80%10',
      '80–90%6',
      '90–95%0',
      '95% and over4',
      'No score yet3',
    ]);
    expect(screen.getByText(/Suggestions at 0% are not offered for review/)).toBeInTheDocument();
  });

  it('saves a Shadow change without a confirm', async () => {
    renderPage();
    await screen.findByText('4 entries');
    fireEvent.change(slider(), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/settings', {
        remove: { mode: 'shadow', threshold: 0.8 },
      })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sample: Agree removes via accept-reject, Disagree keeps via decline, then refreshes', async () => {
    renderPage();
    await screen.findByText('4 entries');
    fireEvent.click(screen.getByRole('button', { name: 'Check a sample' }));
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText('93% sure')).toBeInTheDocument();
    expect(screen.getAllByText('only fits one customer').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Agree (remove)' }));
    expect(await screen.findByText('2 of 2')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/api/learning/suggestions/501/accept', {
      action: 'reject',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Disagree (keep)' }));
    expect(
      await screen.findByText(/1 agreed \(removed\), 1 disagreed \(kept\)/)
    ).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/api/learning/suggestions/502/decline', {});
    expect(api.post).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Close and update the numbers' }));
    await waitFor(() =>
      expect(
        api.get.mock.calls.filter(([url]) => url === '/api/knowledge-base/auto-actions')
      ).toHaveLength(2)
    );
  });

  it('sample: a suggestion that changed or was decided elsewhere counts as skipped, not as a verdict', async () => {
    api.post.mockImplementation((url: string) =>
      url.endsWith('/501/accept')
        ? ok({ status: 'expired', reason: 'The entry was edited.' })
        : Promise.reject(
            Object.assign(new Error('Request failed'), {
              status: 409,
              data: { success: false, error: 'This suggestion was already decided.' },
            })
          )
    );
    renderPage();
    await screen.findByText('4 entries');
    fireEvent.click(screen.getByRole('button', { name: 'Check a sample' }));
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agree (remove)' }));
    expect(await screen.findByText('2 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disagree (keep)' }));
    expect(
      await screen.findByText(
        /0 agreed \(removed\), 0 disagreed \(kept\), 0 skipped, 2 changed since — skipped/
      )
    ).toBeInTheDocument();
  });

  it('sample: a 0% suggestion is never offered', async () => {
    api.get.mockImplementation((url: string) => {
      if (url === '/api/knowledge-base/auto-actions') return ok(overview());
      if (url === '/api/knowledge-base/auto-actions/sample')
        return ok({
          ...sample,
          items: [{ ...sample.items[0], confidence: 0 }, sample.items[1]],
        });
      if (url === '/api/knowledge-base/auto-actions/removed') return ok(removed);
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    renderPage();
    await screen.findByText('4 entries');
    fireEvent.click(screen.getByRole('button', { name: 'Check a sample' }));
    expect(await screen.findByText('1 of 1')).toBeInTheDocument();
    expect(screen.getByText('Opening hours')).toBeInTheDocument();
    expect(screen.queryByText(/Example Shop/)).not.toBeInTheDocument();
  });

  it('Restore asks first, then calls the restore route', async () => {
    renderPage();
    await screen.findByText('Where is the old warehouse?');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/knowledge-base/auto-actions/removed/77/restore',
        {}
      )
    );
  });

  it('shows a calm notice on a backend without these routes', async () => {
    api.get.mockRejectedValue(
      Object.assign(new Error('Request failed'), { status: 404, data: '<pre>Cannot GET</pre>' })
    );
    renderPage();
    expect(await screen.findByText(/arrive with the next backend release/)).toBeInTheDocument();
    expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument();
  });

  it('a 404 from a route that exists is an error, not the older-backend notice', async () => {
    api.get.mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        status: 404,
        data: { success: false, error: 'Workspace not found' },
      })
    );
    renderPage();
    expect(await screen.findByText(/Workspace not found/)).toBeInTheDocument();
    expect(screen.queryByText(/arrive with the next backend release/)).not.toBeInTheDocument();
  });
});

// ─── One page for every action (BE with `actions`) ──────────────────────────────────────────────
const gateOpen = { allowed: true, needRated: 0, rate: 0.95, reason: null };
const actionRow = (over: Record<string, unknown> = {}) => ({
  mode: 'shadow',
  threshold: null,
  agreement: { decided: 0, agreed: 0, rate: null, atThreshold: null },
  gate: gateOpen,
  wouldAct: 0,
  actedLast90d: 0,
  blockedBy: [],
  ...over,
});
const withActions = (over: Record<string, Record<string, unknown>> = {}) => ({
  ...overview(),
  actions: {
    remove: actionRow({
      threshold: 0.9,
      wouldAct: 4,
      actedLast90d: 7,
      agreement: {
        decided: 20,
        agreed: 14,
        rate: 0.7,
        atThreshold: { total: 10, agreed: 9, rate: 0.9 },
      },
      ...over.remove,
    }),
    approveMined: actionRow({
      mode: 'auto',
      threshold: 0.85,
      actedLast90d: 3,
      ...over.approveMined,
    }),
    hold: actionRow({
      wouldAct: 2,
      gate: { allowed: false, needRated: 3, rate: null, reason: 'not_enough_rated' },
      ...over.hold,
    }),
    cleanPersonalData: actionRow({ mode: 'auto', actedLast90d: 5, ...over.cleanPersonalData }),
  },
  transientSkips: 0,
  ...over.top,
});
const minedSample = {
  action: 'approveMined',
  items: [
    {
      action: 'approveMined',
      suggestionId: null,
      entryId: 61,
      publicId: 'KB-61',
      subject: 'qa',
      question: 'Do you ship to islands?',
      answer: 'Yes, by boat.',
      reasons: [],
      note: null,
      confidence: 0.88,
    },
  ],
  poolLimited: false,
};
const refusal409 = Object.assign(new Error('Request failed'), {
  status: 409,
  data: {
    success: false,
    code: 'AUTOMATION_NEEDS_SAMPLE',
    action: 'hold',
    needRated: 2,
    rate: null,
    reason: 'not_enough_rated',
  },
});
const row = (key: string) => screen.getByTestId(`kb-auto-row-${key}`);
const wireActions = (current: unknown = withActions()) => {
  api.get.mockImplementation((url: string, config?: { params?: { action?: string } }) => {
    if (url === '/api/knowledge-base/auto-actions') return ok(current);
    if (url === '/api/knowledge-base/auto-actions/sample')
      return ok(config?.params?.action === 'approveMined' ? minedSample : sample);
    if (url === '/api/knowledge-base/auto-actions/removed') return ok(removed);
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
};

describe('Automatic actions page — every action on one page', () => {
  beforeEach(() => wireActions());

  it('lists the four active actions and the three that always wait for a person', async () => {
    renderPage();
    await screen.findByTestId('kb-auto-row-remove');
    for (const key of ['remove', 'approveMined', 'hold', 'cleanPersonalData']) {
      const active = row(key);
      expect(within(active).getByRole('button', { name: 'Off' })).toBeInTheDocument();
      expect(within(active).getByRole('button', { name: 'Shadow' })).toBeInTheDocument();
      expect(within(active).getByRole('button', { name: 'Automatic' })).toBeInTheDocument();
      expect(within(active).getByRole('button', { name: 'Check a sample' })).toBeInTheDocument();
    }
    expect(screen.getByText('Remove entries the review is sure are wrong')).toBeInTheDocument();
    expect(screen.getByText('Approve answers learned from the mailbox')).toBeInTheDocument();
    expect(screen.getByText('Set aside answers about one customer')).toBeInTheDocument();
    expect(screen.getByText('Remove personal details from answers')).toBeInTheDocument();
    for (const label of ['Merge into a case', 'Rewrite an answer', 'Approve saved answers']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Always waits for a person (coming later)')).toHaveLength(3);
    expect(within(row('remove')).getByText('Would act on 4')).toBeInTheDocument();
    expect(within(row('remove')).getByRole('slider')).toBeInTheDocument();
    expect(within(row('hold')).queryByRole('slider')).not.toBeInTheDocument();
    expect(within(row('remove')).getByText(/agreed 9 of 10 \(90%\)/)).toBeInTheDocument();
  });

  it('a gate that is not met disables Automatic and says how many more to rate', async () => {
    wireActions(withActions());
    renderPage();
    await screen.findByTestId('kb-auto-row-hold');
    expect(within(row('hold')).getByText('Rate 3 more to switch this on.')).toBeInTheDocument();
    expect(within(row('hold')).getByRole('button', { name: 'Automatic' })).toBeDisabled();
    expect(within(row('remove')).getByRole('button', { name: 'Automatic' })).toBeEnabled();
  });

  it('a platform admin may override the gate', async () => {
    useAuthStore.setState({ user: { role: 'admin' } as never });
    renderPage();
    await screen.findByTestId('kb-auto-row-hold');
    expect(within(row('hold')).getByRole('button', { name: 'Automatic' })).toBeEnabled();
    expect(
      within(row('hold')).getByText(/You can override this as a platform admin\./)
    ).toBeInTheDocument();
  });

  it('a 409 from the gate shows the same line on that row', async () => {
    wireActions(withActions({ hold: { gate: gateOpen } }));
    api.patch.mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        status: 409,
        data: {
          success: false,
          code: 'AUTOMATION_NEEDS_SAMPLE',
          action: 'hold',
          needRated: 2,
          rate: null,
          reason: 'not_enough_rated',
        },
      })
    );
    renderPage();
    await screen.findByTestId('kb-auto-row-hold');
    fireEvent.click(within(row('hold')).getByRole('button', { name: 'Automatic' }));
    fireEvent.click(within(row('hold')).getByRole('button', { name: 'Save' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Turn on' }));
    expect(await within(row('hold')).findByText('Rate 2 more to switch this on.')).toBeVisible();
    expect(api.patch).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/settings', {
      hold: { mode: 'auto' },
    });
  });

  it('a 409 puts the segment back on the saved mode and the line stays until the overview refreshes', async () => {
    wireActions(withActions({ hold: { gate: gateOpen } }));
    api.patch.mockRejectedValue(refusal409);
    renderPage();
    await screen.findByTestId('kb-auto-row-hold');
    fireEvent.click(within(row('hold')).getByRole('button', { name: 'Automatic' }));
    fireEvent.click(within(row('hold')).getByRole('button', { name: 'Save' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Turn on' }));
    await within(row('hold')).findByText('Rate 2 more to switch this on.');
    expect(within(row('hold')).getByRole('button', { name: 'Shadow' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(row('hold')).getByRole('button', { name: 'Automatic' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('a 409 on lowering the bar while Automatic shows the line and restores the slider', async () => {
    wireActions(
      withActions({
        remove: {
          mode: 'auto',
          gate: { allowed: false, needRated: 4, rate: null, reason: 'not_enough_rated' },
        },
      })
    );
    api.patch.mockRejectedValue({
      ...refusal409,
      data: { ...refusal409.data, action: 'remove', needRated: 4 },
    });
    renderPage();
    await screen.findByTestId('kb-auto-row-remove');
    fireEvent.change(within(row('remove')).getByRole('slider'), { target: { value: '80' } });
    fireEvent.click(within(row('remove')).getByRole('button', { name: 'Save' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Lower the bar' }));
    expect(await within(row('remove')).findByText('Rate 4 more to switch this on.')).toBeVisible();
    expect(within(row('remove')).getByRole('slider')).toHaveValue('90');
  });

  it('after the overview refreshes with the gate allowed there is no stale line', async () => {
    wireActions(withActions({ hold: { gate: gateOpen } }));
    api.patch.mockRejectedValueOnce(refusal409);
    renderPage();
    await screen.findByTestId('kb-auto-row-hold');
    fireEvent.click(within(row('hold')).getByRole('button', { name: 'Automatic' }));
    fireEvent.click(within(row('hold')).getByRole('button', { name: 'Save' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Turn on' }));
    await within(row('hold')).findByText('Rate 2 more to switch this on.');
    // A rating elsewhere on the row re-reads the overview (gate allowed).
    fireEvent.click(within(row('hold')).getByRole('button', { name: 'Check a sample' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() =>
      expect(within(row('hold')).queryByText(/Rate 2 more/)).not.toBeInTheDocument()
    );
  });

  it('saves one action at a time, with its bar only when it has one', async () => {
    renderPage();
    await screen.findByTestId('kb-auto-row-remove');
    fireEvent.change(within(row('remove')).getByRole('slider'), { target: { value: '95' } });
    fireEvent.click(within(row('remove')).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/settings', {
        remove: { mode: 'shadow', threshold: 0.95 },
      })
    );
    fireEvent.click(within(row('hold')).getByRole('button', { name: 'Off' }));
    fireEvent.click(within(row('hold')).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/settings', {
        hold: { mode: 'off' },
      })
    );
  });

  it('shows a blocked-by notice on the actions it stops, and not on the others', async () => {
    wireActions(
      withActions({
        remove: { blockedBy: ['kb.quality_review_enabled'] },
        hold: { blockedBy: ['kb.consolidation_enabled', 'kb.consolidation_dry_run'] },
      })
    );
    renderPage();
    await screen.findByTestId('kb-auto-row-remove');
    const notice = /Not checked for this workspace — switch on/;
    expect(within(row('remove')).getByText(notice)).toHaveTextContent(
      /Platform console › Feature flags/
    );
    expect(within(row('hold')).getByText(/switch off test mode/)).toBeInTheDocument();
    expect(within(row('approveMined')).queryByText(notice)).not.toBeInTheDocument();
    expect(within(row('cleanPersonalData')).queryByText(notice)).not.toBeInTheDocument();
    expect(screen.queryByText(/kb\.quality_review_enabled/)).not.toBeInTheDocument();
  });

  it('sample: Agree only records a rating and never touches the suggestions', async () => {
    renderPage();
    await screen.findByTestId('kb-auto-row-approveMined');
    fireEvent.click(within(row('approveMined')).getByRole('button', { name: 'Check a sample' }));
    expect(await screen.findByText('Do you ship to islands?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your rating only teaches the %; decide the entry itself in the Knowledge Base.'
      )
    ).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/sample', {
      params: { limit: 30, action: 'approveMined' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/ratings', {
        action: 'approveMined',
        entryId: 61,
        agreed: true,
      })
    );
    expect(
      api.post.mock.calls.filter(([url]) => String(url).startsWith('/api/learning/suggestions'))
    ).toHaveLength(0);
  });

  it('links the Changed automatically card to the knowledge base filter', async () => {
    renderPage();
    await screen.findByTestId('kb-auto-row-remove');
    const link = screen.getByRole('link', { name: /Changed automatically|Review them/ });
    expect(link).toHaveAttribute('href', '/knowledge-base?status=auto_changed');
    expect(screen.getByText(/in the last 90 days/)).toHaveTextContent(/15/);
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });

  it('says when scoring batches were skipped for a slow AI', async () => {
    wireActions(withActions({ top: { transientSkips: 2 } }));
    renderPage();
    expect(
      await screen.findByText(
        '2 batches were skipped because the AI did not answer in time; they are retried next run.'
      )
    ).toBeInTheDocument();
  });

  it('mounts the scoring health card here', async () => {
    renderPage();
    expect(await screen.findByTestId('quality-coverage')).toBeInTheDocument();
  });

  it('an older backend (no actions) keeps the remove-only page', async () => {
    wireGets();
    renderPage();
    await screen.findByText('4 entries');
    expect(screen.queryByTestId('kb-auto-row-remove')).not.toBeInTheDocument();
    expect(screen.queryByText('Merge into a case')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });
});
