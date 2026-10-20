/**
 * The platform's two daily token limits (audit F4). What must hold:
 * - the platform limits ARE the defaults every workspace gets (owner 2026-10-12): the fields always
 *   hold the value in force, a blank field is refused (never null — the backend refuses a cleared
 *   platform limit), and a built-in value not saved yet is labelled "Not saved" and saved on Save;
 * - an invalid value blocks Save.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

type Edit = Record<string, unknown>;
let sent: Edit[] = [];
/** Plain function: vitest 4 fails a test on a module-level vi.fn's caught rejection. */
/** The KB `release` of the answer; the service hands both releases back (BE round 12). */
let answer: () => Promise<unknown> = () => Promise.resolve();
let regularAnswer: unknown = null;
let warned: string[] = [];
let succeeded: string[] = [];
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: {
    updatePlatformLimits: (edit: Edit) => {
      sent.push(edit);
      return answer().then((release) => ({ release, regularRelease: regularAnswer }));
    },
  },
}));
vi.mock('sonner', () => ({
  toast: {
    success: (title: string) => succeeded.push(title),
    warning: (_title: string, options?: { description?: string }) =>
      warned.push(options?.description ?? ''),
    error: () => {},
  },
}));

const { TokenLimitsCard } = await import('../TokenLimitsCard');

// be-toklim-wt 0d61a3e0 `updatePlatformTokenBudgets`: switching own-key enforcement off lifts BOTH
// limits (`decide`: `enforcementOff`), so `releaseForEdit` / `regularReleaseForEdit` answer a
// release or `{error}`, never null (FE audit pass 16, NIT). These are the empty answers.
const emptyKbRelease = {
  releasedOrganizations: [],
  stillPaused: [],
  promotedKbJobs: 0,
  promotedKbJobsInFailedOrganizations: 0,
  resumedMines: 0,
  minesAlreadyQueued: 0,
  failedToQueue: 0,
  failedOrganizations: [],
  noticeOnlyOrganizations: [],
  unreachableOrganizations: [],
  partialOrganizations: [],
  truncated: false,
};
const regularRelease = (over: Record<string, unknown> = {}) => ({
  releasedOrganizations: [],
  stillStopped: [],
  unreachableOrganizations: [],
  truncated: false,
  ...over,
});

type Budgets = Parameters<typeof TokenLimitsCard>[0]['budgets'];
const budgets = (over: Partial<Budgets> = {}): Budgets => ({
  kb: { limit: 7_000_000, source: 'platform' },
  regular: { limit: 2_000_000, source: 'default' },
  ownKeyEnforced: false,
  workspaceOverrides: {},
  ...over,
});

const renderCard = (value: Budgets = budgets()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TokenLimitsCard budgets={value} />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
};

const kbField = () => screen.getByLabelText('KB processing (tokens per UTC day)');
const regularField = () => screen.getByLabelText('Regular work (tokens per UTC day)');
const saveButton = () => screen.getByRole('button', { name: 'Save' });

beforeEach(() => {
  sent = [];
  warned = [];
  succeeded = [];
  answer = () => Promise.resolve();
  regularAnswer = null;
});
afterEach(cleanup);

describe('TokenLimitsCard', () => {
  it('a blank field is refused: Save is disabled and the field says why — never null', () => {
    renderCard();
    fireEvent.change(kbField(), { target: { value: '' } });
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Enter a limit — 0 switches it off.')).toBeTruthy();
    fireEvent.click(saveButton());
    expect(sent).toHaveLength(0);
  });

  it('the fields always open on the value in force — saved or not', () => {
    renderCard();
    expect(kbField()).toHaveValue('7000000');
    expect(regularField()).toHaveValue('2000000');
  });

  it('an unchanged KB value and own-key switch are not re-sent; changed ones are (pass 9)', async () => {
    renderCard(budgets({ ownKeyEnforced: false }));
    // The KB field opens pre-filled with its platform value (7,000,000): Save as opened.
    fireEvent.change(regularField(), { target: { value: '3000000' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      kbTokensPerDay: undefined,
      regularTokensPerDay: 3_000_000,
      ownKeyEnforced: undefined,
    });
    cleanup();
    renderCard(budgets({ ownKeyEnforced: false }));
    fireEvent.change(kbField(), { target: { value: '8000000' } });
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(saveButton());
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toMatchObject({ kbTokensPerDay: 8_000_000, ownKeyEnforced: true });
  });

  it('a value not saved yet (the built-in fail-safe) IS sent unchanged: Save makes it the platform default', async () => {
    renderCard(budgets({ kb: { limit: 7_000_000, source: 'default' } }));
    fireEvent.change(regularField(), { target: { value: '3000000' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      kbTokensPerDay: 7_000_000,
      regularTokensPerDay: 3_000_000,
      ownKeyEnforced: undefined,
    });
  });

  // FE audit pass 13, LOW: the regular value too — the backend re-runs the regular release (a scan
  // of up to 1000 notices) for any re-sent same-or-higher value (b046e2f9 keepsLimitLifted).
  it('a prefilled regular value is not re-sent when only KB changed (pass 13)', async () => {
    renderCard(budgets({ regular: { limit: 2_000_000, source: 'platform' } }));
    expect(regularField()).toHaveValue('2000000');
    fireEvent.change(kbField(), { target: { value: '8000000' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].kbTokensPerDay).toBe(8_000_000);
    expect(sent[0].regularTokensPerDay).toBeUndefined();
  });

  it('CONTROL: a changed regular value IS sent', async () => {
    renderCard(budgets({ regular: { limit: 2_000_000, source: 'platform' } }));
    fireEvent.change(regularField(), { target: { value: '2500000' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].regularTokensPerDay).toBe(2_500_000);
  });

  it('an invalid value blocks Save', () => {
    renderCard();
    fireEvent.change(regularField(), { target: { value: '1,2,3' } });
    expect(saveButton()).toBeDisabled();
  });

  it('a limit not saved yet is tagged "Not saved" and the card says what that means', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TokenLimitsCard budgets={budgets()} />
      </QueryClientProvider>
    );
    const card = document.body.textContent ?? '';
    expect(card).toContain('Regular work 2,000,000 · built-in default Not saved');
    expect(card).toContain('KB processing 7,000,000 · platform setting');
    expect(card).not.toContain('platform setting Not saved');
    expect(screen.getByTestId('token-limits-not-saved').textContent).toContain(
      'Edit and Save to make it this platform’s default.'
    );
  });

  it('CONTROL: both saved — no tag, no note', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TokenLimitsCard budgets={budgets({ regular: { limit: 2_000_000, source: 'platform' } })} />
      </QueryClientProvider>
    );
    expect(screen.queryByText('Not saved')).toBeNull();
    expect(screen.queryByTestId('token-limits-not-saved')).toBeNull();
  });

  it('there is no Reset or clear anywhere: a platform limit is changed, never cleared', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: /Reset|Clear/ })).toBeNull();
  });
});

describe('TokenLimitsCard — after Save (audit pass 8)', () => {
  it('the card leaves the form only once the saved limits are read back — never the old ones as saved (LOW)', async () => {
    let shown = budgets();
    let reread: () => void = () => {};
    let reads = 0;
    const Host = () => {
      const { data } = useQuery({
        queryKey: ['platform-managed-ai-usage', 30],
        queryFn: () => {
          reads += 1;
          // The first read answers at once; the one after the save waits to be let go.
          return reads === 1
            ? Promise.resolve(shown)
            : new Promise<Budgets>((resolve) => (reread = () => resolve(shown)));
        },
      });
      return data ? <TokenLimitsCard budgets={data} /> : null;
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Host />
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(kbField(), { target: { value: '9000000' } });
    shown = budgets({ kb: { limit: 9_000_000, source: 'platform' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(reads).toBe(2));
    // Saved, not yet read back: the form stays — the old 7,000,000 is never shown as saved.
    expect(screen.queryByText(/7,000,000 · platform setting/)).toBeNull();
    reread();
    await screen.findByText(/9,000,000 · platform setting/);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('Cancel → Edit while a Save is on its way cannot reopen the PRE-save figures and revert them (pass 10, MED)', async () => {
    let shown = budgets();
    let finish: () => void = () => {};
    answer = () => new Promise<void>((resolve) => (finish = resolve));
    const Host = () => {
      const { data } = useQuery({
        queryKey: ['platform-managed-ai-usage', 30],
        queryFn: () => Promise.resolve(shown),
      });
      return data ? <TokenLimitsCard budgets={data} /> : null;
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Host />
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(kbField(), { target: { value: '9000000' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(sent).toHaveLength(1));
    // The operator tries to leave and come back while the Save is on its way: the form stays.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    shown = budgets({ kb: { limit: 9_000_000, source: 'platform' } });
    finish();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    // Reopened from the SAVED figure, so a Save straight away sends nothing back for KB.
    expect(kbField()).toHaveValue('9000000');
    fireEvent.click(saveButton());
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].kbTokensPerDay).toBeUndefined();
  });

  it('CONTROL: a failed Save leaves the form and Cancel works again', async () => {
    answer = () => Promise.reject(new Error('down'));
    renderCard();
    fireEvent.change(regularField(), { target: { value: '3000000' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('CONTROL: without Cancel → Edit, the answered Save closes the form', async () => {
    renderCard();
    fireEvent.change(regularField(), { target: { value: '3000000' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
  });

  it('own-key switched off on a KB limit of 0: a failed release never advises raising it (pass 10, LOW)', async () => {
    // be-toklim-wt 64d8d228: own-key off and a re-sent 0 both re-run the release; this card re-sends
    // neither unchanged, and its KB field holds the saved 0 — no raise is possible, and typing 0
    // retries only from a blank field (pass 12), so the advice says exactly that.
    answer = () => Promise.resolve({ error: 'x' });
    regularAnswer = regularRelease();
    renderCard(budgets({ kb: { limit: 0, source: 'platform' }, ownKeyEnforced: true }));
    fireEvent.click(
      screen.getByLabelText(
        'Stop own-key workspaces at their limits (off: measure and notify only)'
      )
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(warned).toHaveLength(1));
    expect(sent[0]).toMatchObject({ ownKeyEnforced: false });
    expect(warned[0]).not.toContain('raising it does');
    expect(warned[0]).toContain('The KB limit is now off (0)');
    expect(warned[0]).toContain(
      'If the KB field is blank, typing 0 into it does; otherwise this work waits for the reset at'
    );
    expect(warned[0].split('The KB limit is now off (0)')).toHaveLength(2);
  });

  it('CONTROL: the same failure on a KB limit above 0 keeps the raise advice', async () => {
    answer = () => Promise.resolve({ error: 'x' });
    regularAnswer = regularRelease();
    renderCard(budgets({ ownKeyEnforced: true }));
    fireEvent.click(
      screen.getByLabelText(
        'Stop own-key workspaces at their limits (off: measure and notify only)'
      )
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(warned).toHaveLength(1));
    expect(warned[0]).toContain(
      'raising it does, and so does typing the limit now in force, or 0 (no limit), into a blank KB field.'
    );
  });

  it('while a Save is on its way the fields and the switch are locked — no edit is closed over as saved (pass 11)', async () => {
    let fail: () => void = () => {};
    answer = () => new Promise<void>((_resolve, reject) => (fail = () => reject(new Error('x'))));
    renderCard();
    fireEvent.change(regularField(), { target: { value: '3000000' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(kbField()).toBeDisabled();
    expect(regularField()).toBeDisabled();
    expect(screen.getByRole('switch')).toBeDisabled();
    // CONTROL: once the Save has answered (failed, so the form stays), they are editable again.
    await act(async () => {
      fail();
      await Promise.resolve();
    });
    await waitFor(() => expect(regularField()).not.toBeDisabled());
    expect(kbField()).not.toBeDisabled();
    expect(screen.getByRole('switch')).not.toBeDisabled();
  });

  it('CONTROL: with nothing on its way the fields and the switch are editable', () => {
    renderCard();
    expect(kbField()).not.toBeDisabled();
    expect(regularField()).not.toBeDisabled();
    expect(screen.getByRole('switch')).not.toBeDisabled();
  });
});

// be-toklim-wt b046e2f9 updatePlatformLimits: a raised regular limit runs the regular release and
// answers `regularRelease` beside the KB `release` (null here: KB untouched).
describe('TokenLimitsCard — the regular release in the save toast (BE round 12)', () => {
  it('a raise that leaves a workspace stopped warns, in regular words only', async () => {
    answer = () => Promise.resolve(null);
    regularAnswer = regularRelease({ releasedOrganizations: [2], stillStopped: [3] });
    renderCard();
    fireEvent.change(regularField(), { target: { value: '4000000' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(warned).toHaveLength(1));
    expect(sent[0]).toEqual({ regularTokensPerDay: 4_000_000 });
    expect(warned[0]).toMatch(/^The regular limit no longer stops 1 workspace: AI drafts/);
    expect(warned[0]).toContain('1 workspace stays stopped');
    expect(warned[0]).not.toMatch(/KB|knowledge|min(e|ing)|pause/i);
    expect(succeeded).toHaveLength(0);
  });

  // FE audit pass 14, LOW: the card hands the regular limit it saved to the toast, so a save of
  // 0 never advises raising it.
  it('a save of regular 0 with an unreachable workspace: no "raise it" advice', async () => {
    answer = () => Promise.resolve(null);
    regularAnswer = regularRelease({ unreachableOrganizations: [3] });
    renderCard();
    fireEvent.change(regularField(), { target: { value: '0' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(warned).toHaveLength(1));
    expect(sent[0]).toEqual({ regularTokensPerDay: 0 });
    expect(warned[0]).toContain('the regular limit is now off (0)');
    expect(warned[0]).not.toMatch(/raising the regular limit/);
  });

  // FE audit pass 15, LOW: switching own-key enforcement off is a regular lift too (BE 0d61a3e0
  // `updatePlatformTokenBudgets` → `decide`: `enforcementOff`), yet that save sends no regular value — the card
  // must hand the toast the regular limit still in force (`budgets.regular.limit`).
  it('own-key switched off on a regular limit of 0: the advice reads the limit in force, never "raise it"', async () => {
    answer = () => Promise.resolve(emptyKbRelease);
    regularAnswer = regularRelease({ unreachableOrganizations: [3] });
    renderCard(budgets({ regular: { limit: 0, source: 'platform' }, ownKeyEnforced: true }));
    fireEvent.click(
      screen.getByLabelText(
        'Stop own-key workspaces at their limits (off: measure and notify only)'
      )
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(warned).toHaveLength(1));
    expect(sent[0]).toEqual({ ownKeyEnforced: false });
    expect(warned[0]).toContain('the regular limit is now off (0)');
    expect(warned[0].split('the regular limit is now off (0)')).toHaveLength(2);
    expect(warned[0]).not.toMatch(/raising the regular limit/);
  });

  it('CONTROL: no regular release ran (regularRelease null) just says saved', async () => {
    answer = () => Promise.resolve(null);
    renderCard();
    fireEvent.change(regularField(), { target: { value: '4000000' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(succeeded).toEqual(['Daily token limits saved']));
    expect(warned).toHaveLength(0);
  });
});
