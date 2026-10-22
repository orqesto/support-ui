/**
 * Settings › AI › Automatic actions: the "Approve answers people saved" action (approveCaptures).
 * Renders the real panel and services over a mocked transport. An older backend sends no
 * approveCaptures, and then the "Approve saved answers" waiting row stays. All data is invented.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/components/kb/KbQualityCoverage', () => ({
  KbQualityCoverage: () => <div data-testid="quality-coverage" />,
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

import { KbAutoActionsPanel } from '../KbAutoActionsPanel';

const ok = (data: unknown) => Promise.resolve({ data: { success: true, data } });
const renderPage = () =>
  render(
    <MemoryRouter>
      <KbAutoActionsPanel />
    </MemoryRouter>
  );
const dialog = () => screen.getByRole('dialog');
const row = (key: string) => screen.getByTestId(`kb-auto-row-${key}`);

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
/** The four actions an older backend sends: 7 + 3 + 0 + 5 = 15 changes. */
const withActions = () => ({
  settings: { remove: { mode: 'shadow', threshold: 0.9 } },
  actions: {
    remove: actionRow({ threshold: 0.9, wouldAct: 4, actedLast90d: 7 }),
    approveMined: actionRow({ mode: 'auto', threshold: 0.85, actedLast90d: 3 }),
    hold: actionRow(),
    cleanPersonalData: actionRow({ mode: 'auto', actedLast90d: 5 }),
  },
  transientSkips: 0,
});
const minedSample = { items: [], poolLimited: false };

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null });
  api.post.mockImplementation(() => ok({ status: 'rejected' }));
  api.patch.mockImplementation(() => ok({ settings: {}, startedRun: false }));
});
afterEach(cleanup);

// ─── Approve answers people saved (approveCaptures) ─────────────────────────────────────────────
const capturesRow = (over: Record<string, unknown> = {}) => ({
  approveCaptures: {
    mode: 'shadow',
    threshold: 0.9,
    wouldAct: 12,
    gate: { allowed: false, needRated: 20, rate: null, reason: 'not_enough_rated' },
    actedLast90d: 2,
    backlogBlockedBy: [],
    ...over,
  },
});
const withCaptures = (over: Record<string, unknown> = {}) => {
  const base = withActions();
  return { ...base, actions: { ...base.actions, ...capturesRow(over) } };
};
const capturesSample = {
  items: [
    {
      action: 'approveCaptures',
      suggestionId: null,
      entryId: 71,
      publicId: 'KB-71',
      subject: 'qa',
      question: 'How long does a refund take?',
      answer: 'Five working days after we receive the parcel.',
      reasons: [],
      note: null,
      confidence: 0.94,
      approved: false,
      personApproved: false,
      capturedVia: 'resolve',
      capturedByName: 'Anna',
    },
    {
      action: 'approveCaptures',
      suggestionId: null,
      entryId: 72,
      publicId: 'KB-72',
      subject: 'qa',
      question: 'Do you sell gift cards?',
      answer: 'Yes, in the shop.',
      reasons: [],
      note: null,
      confidence: 0.91,
      approved: true,
      personApproved: false,
      capturedVia: 'manual_promote',
      capturedByName: 'Ben',
    },
  ],
  poolLimited: false,
};
const wireCaptures = (current: unknown = withCaptures()) => {
  api.get.mockImplementation((url: string, config?: { params?: { action?: string } }) => {
    if (url === '/api/knowledge-base/auto-actions') return ok(current);
    if (url === '/api/knowledge-base/auto-actions/sample')
      return ok(config?.params?.action === 'approveCaptures' ? capturesSample : minedSample);
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
};

describe('Automatic actions — approve answers people saved', () => {
  beforeEach(() => wireCaptures());

  it('shows the real row with its bar, count and gate, in place of the waiting row', async () => {
    renderPage();
    const captures = await screen.findByTestId('kb-auto-row-approveCaptures');
    expect(within(captures).getByText('Approve answers people saved')).toBeInTheDocument();
    expect(within(captures).getByRole('slider')).toBeInTheDocument();
    expect(within(captures).getByText('Would act on 12 answers')).toBeInTheDocument();
    expect(within(captures).getByText('Rate 20 more to switch this on.')).toBeInTheDocument();
    expect(within(captures).getByRole('button', { name: 'Automatic' })).toBeDisabled();
    expect(screen.queryByText('Approve saved answers')).not.toBeInTheDocument();
    expect(screen.getAllByText('Always waits for a person (coming later)')).toHaveLength(2);
    // The Changed automatically card counts it too (15 + 2).
    expect(screen.getByText(/you can still undo/)).toHaveTextContent(/^17 changes/);
    expect(screen.getByText('Approve answers people saved: 2')).toBeInTheDocument();
  });

  it('a backend without the action keeps the waiting row, and the card does not list it', async () => {
    wireCaptures(withActions());
    renderPage();
    await screen.findByTestId('kb-auto-row-remove');
    expect(screen.queryByTestId('kb-auto-row-approveCaptures')).not.toBeInTheDocument();
    expect(screen.getByText('Approve saved answers')).toBeInTheDocument();
    expect(screen.queryByText(/Approve answers people saved/)).not.toBeInTheDocument();
  });

  it('sample: shows who saved each answer, and Agree only records a rating', async () => {
    renderPage();
    const captures = await screen.findByTestId('kb-auto-row-approveCaptures');
    fireEvent.click(within(captures).getByRole('button', { name: 'Check a sample' }));
    expect(await screen.findByText('How long does a refund take?')).toBeInTheDocument();
    expect(screen.getByText('Five working days after we receive the parcel.')).toBeInTheDocument();
    expect(screen.getByText('94% sure')).toBeInTheDocument();
    expect(screen.getByText('Saved by Anna on Resolve')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/sample', {
      params: { limit: 30, action: 'approveCaptures' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/ratings', {
        action: 'approveCaptures',
        entryId: 71,
        agreed: true,
      })
    );
    expect(await screen.findByText('Saved to KB by Ben')).toBeInTheDocument();
    expect(
      api.post.mock.calls.filter(([url]) => String(url).startsWith('/api/learning/suggestions'))
    ).toHaveLength(0);
  });

  it('says when answers saved earlier are not checked, on this row only', async () => {
    wireCaptures(withCaptures({ backlogBlockedBy: ['kb.quality_review_enabled'] }));
    renderPage();
    const captures = await screen.findByTestId('kb-auto-row-approveCaptures');
    const notice = /Answers saved earlier are checked only when the nightly quality review is on/;
    expect(within(captures).getByText(notice)).toBeInTheDocument();
    expect(screen.getAllByText(notice)).toHaveLength(1);
    expect(screen.queryByText(/kb\.quality_review_enabled/)).not.toBeInTheDocument();
  });

  it('says it is approving the waiting answers now when the switch started a run', async () => {
    wireCaptures(withCaptures({ gate: gateOpen }));
    api.patch.mockImplementation(() =>
      ok({ settings: {}, startedRun: false, startedRuns: { remove: false, approveCaptures: true } })
    );
    renderPage();
    const captures = await screen.findByTestId('kb-auto-row-approveCaptures');
    fireEvent.click(within(captures).getByRole('button', { name: 'Automatic' }));
    fireEvent.click(within(captures).getByRole('button', { name: 'Save' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Turn on' }));
    expect(
      await within(row('approveCaptures')).findByText(/Approving the waiting answers now/)
    ).toBeInTheDocument();
    expect(api.patch).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/settings', {
      approveCaptures: { mode: 'auto', threshold: 0.9 },
    });
  });

  it('a backend that does not say which runs started shows no such line', async () => {
    wireCaptures(withCaptures({ gate: gateOpen }));
    api.patch.mockImplementation(() => ok({ settings: {}, startedRun: true }));
    renderPage();
    const captures = await screen.findByTestId('kb-auto-row-approveCaptures');
    fireEvent.click(within(captures).getByRole('button', { name: 'Automatic' }));
    fireEvent.click(within(captures).getByRole('button', { name: 'Save' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Approving the waiting answers now/)).not.toBeInTheDocument();
  });
});

describe('Automatic actions — approve answers people saved: what Automatic means', () => {
  const autoText =
    'Approves the waiting answers that pass right away, and each new saved answer as soon as it is checked. Every approval is listed under Changed automatically, where you can send it back for review.';

  it('says when saved answers are approved, in the help and the confirm; other actions keep theirs', async () => {
    wireCaptures(withCaptures({ gate: gateOpen }));
    renderPage();
    const captures = await screen.findByTestId('kb-auto-row-approveCaptures');
    fireEvent.click(within(captures).getByRole('button', { name: 'Automatic' }));
    expect(within(captures).getByText(autoText)).toBeInTheDocument();
    expect(within(captures).queryByText('Acts on its own from the next run.')).toBeNull();
    fireEvent.click(within(captures).getByRole('button', { name: 'Save' }));
    expect(within(dialog()).getByText(autoText)).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    // Control: another action keeps the generic text.
    const hold = row('hold');
    fireEvent.click(within(hold).getByRole('button', { name: 'Automatic' }));
    expect(within(hold).getByText('Acts on its own from the next run.')).toBeInTheDocument();
    fireEvent.click(within(hold).getByRole('button', { name: 'Save' }));
    expect(within(dialog()).getByText(/acts on its own from the next run/)).toBeInTheDocument();
    expect(within(dialog()).queryByText(autoText)).toBeNull();
  });

  it('a failed save takes the applying-now line away', async () => {
    wireCaptures(withCaptures({ gate: gateOpen }));
    api.patch.mockImplementationOnce(() =>
      ok({ settings: {}, startedRun: false, startedRuns: { approveCaptures: true } })
    );
    api.patch.mockImplementationOnce(() => Promise.reject(new Error('Network down')));
    renderPage();
    const captures = await screen.findByTestId('kb-auto-row-approveCaptures');
    fireEvent.click(within(captures).getByRole('button', { name: 'Automatic' }));
    fireEvent.click(within(captures).getByRole('button', { name: 'Save' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Turn on' }));
    await within(row('approveCaptures')).findByText(/Approving the waiting answers now/);
    // The refreshed overview still says Shadow, so the draft is Automatic again after the reset.
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    fireEvent.click(within(row('approveCaptures')).getByRole('button', { name: 'Automatic' }));
    fireEvent.click(within(row('approveCaptures')).getByRole('button', { name: 'Save' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText(/Approving the waiting answers now/)).not.toBeInTheDocument()
    );
  });

  it('an unsaved bar change says the count is at the saved bar; remove follows the slider', async () => {
    renderPage();
    const captures = await screen.findByTestId('kb-auto-row-approveCaptures');
    expect(within(captures).getByText('Would act on 12 answers')).toBeInTheDocument();
    fireEvent.change(within(captures).getByRole('slider'), { target: { value: '80' } });
    expect(
      within(captures).getByText('Would act on 12 answers at the saved bar')
    ).toBeInTheDocument();
    // Control: remove counts at the slider's own value, with no suffix.
    fireEvent.change(within(row('remove')).getByRole('slider'), { target: { value: '80' } });
    expect(within(row('remove')).queryByText(/at the saved bar/)).toBeNull();
  });
});

describe('Automatic actions — approve answers people saved: lowering the bar', () => {
  const lowerText =
    'Answers that now pass the lower bar are approved at their next check — tonight at the latest. Every approval is listed under Changed automatically, where you can send it back for review.';

  it('lowering the bar while Automatic says when answers are approved, not "right away"', async () => {
    wireCaptures(withCaptures({ mode: 'auto', gate: gateOpen }));
    renderPage();
    const captures = await screen.findByTestId('kb-auto-row-approveCaptures');
    fireEvent.change(within(captures).getByRole('slider'), { target: { value: '80' } });
    fireEvent.click(within(captures).getByRole('button', { name: 'Save' }));
    expect(within(dialog()).getByText(lowerText)).toBeInTheDocument();
    expect(within(dialog()).queryByText(/right away/)).toBeNull();
  });

  it('CONTROL: switching Automatic on still says "right away"', async () => {
    wireCaptures(withCaptures({ gate: gateOpen }));
    renderPage();
    const captures = await screen.findByTestId('kb-auto-row-approveCaptures');
    fireEvent.click(within(captures).getByRole('button', { name: 'Automatic' }));
    fireEvent.click(within(captures).getByRole('button', { name: 'Save' }));
    expect(within(dialog()).getByText(/right away/)).toBeInTheDocument();
    expect(within(dialog()).queryByText(lowerText)).toBeNull();
  });
});
