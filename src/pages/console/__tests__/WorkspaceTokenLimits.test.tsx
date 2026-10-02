/**
 * One workspace's limits and forecast (audit F2/F6/F7). What must hold:
 * - here a blank field DOES mean "no override" (null) — the dialog edits the whole override;
 * - the cell's accessible name carries the figures (an aria-label used to replace them);
 * - a pause is promised only for a workspace that is stopped at its limits;
 * - "no limit" never reads "a limit of no limit"; an unmeasured forecast invents no figure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OrgTokenBudget, TokenForecast } from '@/services/managedAiUsage.service';

type Edit = { kbTokensPerDay?: number | null; regularTokensPerDay?: number | null };
let sent: Edit[] = [];
let forecast: () => Promise<TokenForecast> = () => Promise.reject(new Error('none'));
/** The KB `release` of the answer; the service hands both releases back (BE round 12). */
let saveAnswer: unknown = undefined;
let regularAnswer: unknown = null;
const toasts: Array<{ kind: string; title: string; description?: string }> = [];
const record = (kind: string) => (title: string, options?: { description?: string }) =>
  toasts.push({ kind, title, description: options?.description });
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: {
    updateWorkspaceLimits: (_org: number, edit: Edit) => {
      sent.push(edit);
      return Promise.resolve(saveAnswer).then((release) => ({
        release,
        regularRelease: regularAnswer,
      }));
    },
    getForecast: () => forecast(),
  },
}));
vi.mock('sonner', () => ({
  toast: { success: record('success'), warning: record('warning'), error: record('error') },
}));

const { WorkspaceLimitCell, WorkspaceTokenLimitsDialog } = await import('../WorkspaceTokenLimits');

// The KB override is the limit in force, so its source is `workspace` (the backend's shape —
// an override never sits beside a `default` source; audit pass 8, wrong-model fixture).
const budget = (over: Partial<OrgTokenBudget> = {}): OrgTokenBudget => ({
  kb: { limit: 5_000_000, source: 'workspace', spentToday: 1_200_000 },
  regular: { limit: 2_000_000, source: 'default', spentToday: 1_700_000 },
  override: { kbTokensPerDay: 5_000_000 },
  enforced: true,
  ...over,
});
const budgets = {
  kb: { limit: 5_000_000, source: 'default' as const },
  regular: { limit: 2_000_000, source: 'default' as const },
  ownKeyEnforced: false,
  workspaceOverrides: {},
};
const makeForecast = (over: Partial<TokenForecast['kb']> = {}): TokenForecast => ({
  organizationId: 7,
  kb: {
    sources: [
      { sourceId: 1, name: 'inbox', threadsInScope: 900, threadsToMine: 900, noCutoff: false },
    ],
    threadsToMine: 900,
    tokensPerThread: { value: 10_000, threadsMeasured: 50, windowDays: 30 },
    estimatedTokens: 9_000_000,
    daysAtLimit: 3,
    limit: { limit: 5_000_000, source: 'default' },
    spentToday: 0,
    // forecastKb always sends these (one read of the workspace's enforcement and settings).
    enforced: true,
    enforcementLookupFailed: false,
    settingsLookupFailed: false,
    ...over,
  },
  regular: {
    windowDays: 28,
    observedDays: 28,
    messagesPerDay: { in: 40, out: 20 },
    tokensPerMessage: { low: 500, typical: 900, high: 2_000, weeksMeasured: 4 },
    expectedTokensPerDay: { low: 30_000, typical: 54_000, high: 120_000 },
    actual: { last7DaysAverage: 50_000, peakDay: null },
    limit: { limit: 0, source: 'platform' },
    spentToday: 0,
    enforced: true,
    enforcementLookupFailed: false,
    settingsLookupFailed: false,
  },
});

const renderDialog = (value: OrgTokenBudget = budget(), platform = budgets) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceTokenLimitsDialog
        organizationId={7}
        name="acme"
        budget={value}
        budgets={platform}
        onClose={() => {}}
      />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  sent = [];
  saveAnswer = undefined;
  regularAnswer = null;
  toasts.length = 0;
  forecast = () => Promise.resolve(makeForecast());
});
afterEach(cleanup);

describe('WorkspaceLimitCell', () => {
  // R17 `enforcementLookupFailed` is also a strict read that succeeded but disagreed with the
  // cached answer — "settings unreadable" was untrue of it (pass 19, LOW).
  it('enforcement not settled: never says "own key, measured only" from the fallback, nor "unreadable"', () => {
    render(
      <WorkspaceLimitCell
        budget={budget({ enforced: false, enforcementLookupFailed: true })}
        onOpen={() => {}}
      />
    );
    expect(screen.getByText(/ · enforcement unknown/)).toBeTruthy();
    expect(screen.queryByText(/unreadable/)).toBeNull();
    expect(screen.queryByText(/measured only/)).toBeNull();
  });

  it('its accessible name carries the figures (F6)', () => {
    render(<WorkspaceLimitCell budget={budget()} onOpen={() => {}} />);
    const cell = screen.getByRole('button');
    expect(cell).toHaveAccessibleName(new RegExp((1_200_000).toLocaleString()));
    expect(cell).toHaveAccessibleName(new RegExp((1_700_000).toLocaleString()));
  });

  it('an override of ONE limit says which — not "custom limits" (pass 9)', () => {
    render(
      <WorkspaceLimitCell
        budget={budget({ override: { kbTokensPerDay: 1_000 } })}
        onOpen={() => {}}
      />
    );
    expect(screen.getByText(/custom KB limit · platform regular limit/)).toBeTruthy();
    expect(screen.queryByText(/custom limits/)).toBeNull();
    cleanup();
    render(
      <WorkspaceLimitCell
        budget={budget({ override: { regularTokensPerDay: 1_000 } })}
        onOpen={() => {}}
      />
    );
    expect(screen.getByText(/custom regular limit · platform KB limit/)).toBeTruthy();
  });

  it('CONTROL: both overridden reads "custom limits"; none reads "platform limits"', () => {
    render(
      <WorkspaceLimitCell
        budget={budget({ override: { kbTokensPerDay: 1_000, regularTokensPerDay: 2_000 } })}
        onOpen={() => {}}
      />
    );
    expect(screen.getByText(/custom limits/)).toBeTruthy();
    cleanup();
    render(<WorkspaceLimitCell budget={budget({ override: null })} onOpen={() => {}} />);
    expect(screen.getByText(/platform limits/)).toBeTruthy();
  });
});

describe('WorkspaceTokenLimitsDialog', () => {
  it('a blank field saves null — no override for that limit', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('KB processing (tokens per UTC day)'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ kbTokensPerDay: null });
  });

  it('a regular-only edit sends only regular — the KB limit is not touched (never null)', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Regular work (tokens per UTC day)'), {
      target: { value: '3,000,000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ regularTokensPerDay: 3_000_000 });
  });

  it('a value retyped in another format is unchanged, so it is not sent', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('KB processing (tokens per UTC day)'), {
      target: { value: '5,000,000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({});
  });

  it('enforced: the KB backlog says it pauses each day until the reset', async () => {
    renderDialog();
    await screen.findByText(
      /pausing each day at the limit until the reset at 00:00 UTC \(\d\d:\d\d your time\)/
    );
  });

  it('own key measured only: never promises a pause (F2)', async () => {
    forecast = () => Promise.resolve(makeForecast({ enforced: false }));
    renderDialog(budget({ enforced: false }));
    await screen.findByText(/nothing pauses/);
    expect(screen.queryByText(/pausing each day/)).toBeNull();
  });

  it('usage row lookup failed: neither a pause nor "measured only" is stated as fact', async () => {
    // The forecast reads the same workspace's enforcement: unsettled there too.
    forecast = () =>
      Promise.resolve(makeForecast({ enforced: true, enforcementLookupFailed: true }));
    renderDialog(budget({ enforced: true, enforcementLookupFailed: true }));
    await screen.findByText(
      /of the KB limit; this workspace’s AI settings or the platform limit settings could not be read or disagree with the answer in use — whether the limit stops work is unknown/
    );
    expect(screen.getByText(/^Blank follows the platform limit/).textContent).toContain(
      'This workspace’s AI settings or the platform limit settings could not be read or disagree with the answer in use — whether the limit stops work is unknown.'
    );
    expect(screen.queryByText(/pausing each day/)).toBeNull();
    expect(screen.queryByText(/measured only/)).toBeNull();
  });

  it('forecast lookup failed (its own `enforced` is a fallback): unknown, not a pause', async () => {
    forecast = () =>
      Promise.resolve(makeForecast({ enforced: true, enforcementLookupFailed: true }));
    renderDialog(budget({ enforced: true }));
    await screen.findByText(/whether the limit stops work is unknown/);
    expect(screen.queryByText(/pausing each day/)).toBeNull();
  });

  it("the forecast's own `enforced` wins over the usage row's", async () => {
    forecast = () => Promise.resolve(makeForecast({ enforced: false }));
    renderDialog(budget({ enforced: true }));
    await screen.findByText(/nothing pauses/);
  });

  it('no regular limit reads "no regular limit", never "a limit of no limit" (F7)', async () => {
    renderDialog();
    await screen.findByText(/no regular limit is set/);
    expect(screen.queryByText(/limit of no limit/)).toBeNull();
  });

  it('a workspace override of 0 says it is switched off here, not "not set" (pass 8 NIT)', async () => {
    const base = makeForecast();
    forecast = () =>
      Promise.resolve({
        ...base,
        regular: { ...base.regular, limit: { limit: 0, source: 'workspace' } },
      });
    renderDialog();
    await screen.findByText(/the regular limit is switched off for this workspace\./);
    expect(screen.queryByText(/no regular limit is set/)).toBeNull();
  });

  it('unmeasured KB cost: says so, with no invented number of days (F7)', async () => {
    forecast = () =>
      Promise.resolve(
        makeForecast({ tokensPerThread: null, estimatedTokens: null, daysAtLimit: null })
      );
    renderDialog();
    await screen.findByText(/not measured yet/);
    expect(screen.queryByText(/30 days/)).toBeNull();
  });

  it('the measured window is the backend’s, not a fixed 30 days (F7, A9)', async () => {
    forecast = () =>
      Promise.resolve(
        makeForecast({ tokensPerThread: { value: 10_000, threadsMeasured: 50, windowDays: 14 } })
      );
    renderDialog();
    await screen.findByText(/mined in the last 14 days/);
    expect(screen.queryByText(/30 days/)).toBeNull();
  });

  it('image checks not covering the window: says the cost may be higher (A2)', async () => {
    forecast = () =>
      Promise.resolve(
        makeForecast({
          imageChecks: { firstRecordedAt: '2026-09-30T08:00:00.000Z', coversWindow: false },
        })
      );
    renderDialog();
    await screen.findByText(
      /Image checks during mining are counted from when they were first recorded for this workspace \(2026-09-30 UTC\); any made before then are not in this figure, so the real cost per conversation may be higher/
    );
  });

  it('no image check recorded yet: never "this release" (pass 11)', async () => {
    forecast = () =>
      Promise.resolve(
        makeForecast({ imageChecks: { firstRecordedAt: null, coversWindow: false } })
      );
    renderDialog();
    await screen.findByText(
      /counted from when they were first recorded, and none has been recorded for this workspace yet; if mining reads images, the real cost per conversation may be higher/
    );
    expect(screen.queryByText(/release/)).toBeNull();
  });

  it('CONTROL: image checks covering the window add no caveat (A2)', async () => {
    forecast = () =>
      Promise.resolve(
        makeForecast({
          imageChecks: { firstRecordedAt: '2026-08-01T00:00:00.000Z', coversWindow: true },
        })
      );
    renderDialog();
    await screen.findByText(/mined in the last/);
    expect(screen.queryByText(/Image checks during mining/)).toBeNull();
  });

  it('the busiest day names its own window, not the 7-day one (A3)', async () => {
    const base = makeForecast();
    forecast = () =>
      Promise.resolve({
        ...base,
        regular: {
          ...base.regular,
          actual: { last7DaysAverage: 50_000, peakDay: { date: '2026-09-12', tokens: 900_000 } },
        },
      });
    renderDialog();
    await screen.findByText(/Busiest UTC day in the last 28 days: 2026-09-12/);
  });

  it('a save that released nothing because the limit is still under today’s spend says so (A1)', async () => {
    saveAnswer = {
      releasedOrganizations: [],
      stillPaused: [7],
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
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0].kind).toBe('warning');
    expect(toasts[0].description).toMatch(
      /1 workspace stays paused — the KB limit that applies to it is still under today's KB spend/
    );
  });

  // BE fix round 22 (C1): a workspace whose notice the release marked partial (a promote that
  // failed) — released, nothing promoted. The toast warns, never the plain success line.
  it('C1: a release the backend marked partial warns that some paused KB work may still wait', async () => {
    const partial = {
      releasedOrganizations: [7],
      stillPaused: [],
      promotedKbJobs: 0,
      promotedKbJobsInFailedOrganizations: 0,
      resumedMines: 0,
      minesAlreadyQueued: 0,
      failedToQueue: 0,
      failedOrganizations: [],
      noticeOnlyOrganizations: [],
      unreachableOrganizations: [],
      partialOrganizations: [7],
      truncated: false,
    };
    saveAnswer = partial;
    renderDialog();
    fireEvent.change(screen.getByLabelText('KB processing (tokens per UTC day)'), {
      target: { value: '9000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0].kind).toBe('warning');
    expect(toasts[0].description).toMatch(
      /In 1 workspace \(#7\) some paused KB work may still wait until the reset at 00:00 UTC/
    );
    expect(toasts[0].description).not.toContain('no parked KB work was found');
    // CONTROL: the same release, not partial — the success line.
    cleanup();
    toasts.length = 0;
    saveAnswer = { ...partial, partialOrganizations: [] };
    renderDialog();
    fireEvent.change(screen.getByLabelText('KB processing (tokens per UTC day)'), {
      target: { value: '9000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({
      kind: 'success',
      description:
        'The KB limit no longer pauses 1 workspace; no parked KB work was found to queue.',
    });
  });

  it('a save the backend could not release after: its own sentence is shown (A1)', async () => {
    saveAnswer = { error: 'Paused KB work could not be released now.' };
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({
      kind: 'warning',
      description:
        'Paused KB work could not be released now. Saving the KB limit unchanged does not retry this; raising it does, and so does typing the limit now in force, or 0 (no limit), into a blank KB field.',
    });
  });

  it('a KB override of 0 saved: a failed release never advises raising the limit (pass 10, LOW)', async () => {
    saveAnswer = { error: 'Paused KB work could not be released now.' };
    renderDialog();
    fireEvent.change(screen.getByLabelText('KB processing (tokens per UTC day)'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(sent[0]).toEqual({ kbTokensPerDay: 0 });
    expect(toasts[0].description).not.toContain('raising it does');
    expect(toasts[0].description).toContain('The KB limit is now off (0)');
  });

  it('a KB field left blank follows a platform KB limit of 0: no raise, and typing 0 there retries (pass 12)', async () => {
    saveAnswer = { error: 'Paused KB work could not be released now.' };
    renderDialog(budget(), { ...budgets, kb: { limit: 0, source: 'default' as const } });
    fireEvent.change(screen.getByLabelText('KB processing (tokens per UTC day)'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(sent[0]).toEqual({ kbTokensPerDay: null });
    expect(toasts[0].description).toContain('The KB limit is now off (0)');
    expect(toasts[0].description).toContain('If the KB field is blank, typing 0 into it does');
    cleanup();
    // The step the advice names: the dialog reopens blank (no override) and a typed 0 IS sent —
    // be-toklim-wt 64d8d228 keepsKbLimitLifted re-runs the release for a re-sent 0.
    renderDialog(budget({ override: null }), {
      ...budgets,
      kb: { limit: 0, source: 'default' as const },
    });
    const kbInput = screen.getByLabelText('KB processing (tokens per UTC day)');
    expect(kbInput).toHaveValue('');
    fireEvent.change(kbInput, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual({ kbTokensPerDay: 0 });
  });

  it('while its Save is on its way the fields are locked — no edit is closed over as saved (pass 11)', async () => {
    let finish: () => void = () => {};
    saveAnswer = new Promise<void>((resolve) => (finish = resolve));
    renderDialog();
    const kbInput = screen.getByLabelText('KB processing (tokens per UTC day)');
    const regularInput = screen.getByLabelText('Regular work (tokens per UTC day)');
    // CONTROL: editable before the Save.
    expect(kbInput).not.toBeDisabled();
    expect(regularInput).not.toBeDisabled();
    fireEvent.change(regularInput, { target: { value: '3000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(kbInput).toBeDisabled();
    expect(regularInput).toBeDisabled();
    finish();
    await waitFor(() => expect(toasts).toHaveLength(1));
  });

  it('CONTROL: a save that lifted nothing (release null) just says saved (A1)', async () => {
    saveAnswer = null;
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toEqual({
      kind: 'success',
      title: 'Limits saved for acme',
      description: undefined,
    });
  });
});

describe('R8 forecast captions', () => {
  /** The BE regular forecast at 2b678d40 (tokenForecastService): window 30, observedDays. */
  const withRegular = (over: Partial<TokenForecast['regular']>, kb = {}): TokenForecast => {
    const base = makeForecast(kb);
    return { ...base, regular: { ...base.regular, windowDays: 30, observedDays: 30, ...over } };
  };
  const regularText = async () =>
    (await screen.findByText(/outgoing messages a day/)).closest('div')?.textContent ?? '';

  it('CONTROL: read fine — the limit is stated plainly', async () => {
    forecast = () =>
      Promise.resolve(withRegular({ limit: { limit: 2_000_000, source: 'default' } }));
    renderDialog();
    const text = await regularText();
    expect(text).toMatch(/against a limit of [\d,]+\./);
    expect(text).not.toContain('may be a fallback');
  });

  it('a young workspace: both averages name the days they are taken over', async () => {
    forecast = () => Promise.resolve(withRegular({ observedDays: 3 }));
    renderDialog();
    const text = await regularText();
    expect(text).toContain(
      '40 incoming + 20 outgoing messages a day on average over the last 3 days.'
    );
    expect(text).toContain(
      '50,000 a day on average over the last 3 days (up to now, today included).'
    );
    expect(text).not.toContain('last 30 days');
    expect(text).not.toContain('last 7 days');
  });

  it('one observed day reads "the last day"', async () => {
    forecast = () => Promise.resolve(withRegular({ observedDays: 1 }));
    renderDialog();
    expect(await regularText()).toContain('messages a day on average over the last day.');
  });

  it('CONTROL: a whole window observed — the window, and 7 days', async () => {
    forecast = () => Promise.resolve(withRegular({}));
    renderDialog();
    const text = await regularText();
    expect(text).toContain('messages a day on average over the last 30 days.');
    expect(text).toContain('a day on average over the last 7 days (up to now');
  });

  // The backend's shape for an empty backlog (be-toklim-wt 2b678d40 tokenForecastService): tokens
  // per thread are still measured, estimatedTokens = 0 × value = 0, daysAtLimit null, and the image
  // gap is reported whatever the backlog (FE audit pass 9: the old fixture had all of these null).
  const nothingToMine = () =>
    makeForecast({
      sources: [
        { sourceId: 1, name: 'inbox', threadsInScope: 900, threadsToMine: 0, noCutoff: false },
      ],
      threadsToMine: 0,
      tokensPerThread: { value: 10_000, threadsMeasured: 50, windowDays: 30 },
      estimatedTokens: 0,
      daysAtLimit: null,
      imageChecks: { firstRecordedAt: '2026-09-30T08:00:00.000Z', coversWindow: false },
    });

  it('nothing to mine: says so — no cost line, no "not measured", no image-check caveat', async () => {
    forecast = () => Promise.resolve(nothingToMine());
    renderDialog();
    await screen.findByText(/^Nothing to mine/);
    expect(screen.queryByText(/not measured/)).toBeNull();
    expect(screen.queryByText(/still to mine/)).toBeNull();
    expect(screen.queryByText(/≈ 0 tokens/)).toBeNull();
    expect(screen.queryByText(/Image checks during mining/)).toBeNull();
  });

  it('CONTROL: the same measured forecast WITH a backlog shows the cost and the image caveat', async () => {
    forecast = () =>
      Promise.resolve({
        ...nothingToMine(),
        kb: { ...nothingToMine().kb, threadsToMine: 5, estimatedTokens: 50_000 },
      });
    renderDialog();
    await screen.findByText(/5 conversations still to mine/);
    expect(screen.getByText(/≈ 50,000 tokens/)).toBeTruthy();
    expect(screen.getByText(/first recorded for this workspace \(2026-09-30 UTC\)/)).toBeTruthy();
  });

  it('CONTROL: a backlog with no measurement still says "not measured yet"', async () => {
    forecast = () =>
      Promise.resolve(
        makeForecast({ tokensPerThread: null, estimatedTokens: null, daysAtLimit: null })
      );
    renderDialog();
    await screen.findByText(/900 conversations still to mine/);
    expect(screen.getByText(/not measured yet/)).toBeTruthy();
  });
});

// be-toklim-wt b046e2f9 updateWorkspaceLimits answers `regularRelease` beside `release`.
describe('WorkspaceTokenLimitsDialog — the regular release in the save toast (BE round 12)', () => {
  it('a regular raise that released the notice: success naming the regular work (R12)', async () => {
    saveAnswer = null;
    regularAnswer = {
      releasedOrganizations: [7],
      stillStopped: [],
      unreachableOrganizations: [],
      truncated: false,
    };
    renderDialog();
    fireEvent.change(screen.getByLabelText('Regular work (tokens per UTC day)'), {
      target: { value: '3000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(sent[0]).toEqual({ regularTokensPerDay: 3_000_000 });
    expect(toasts[0]).toEqual({
      kind: 'success',
      title: 'Limits saved for acme',
      description:
        'The regular limit no longer stops 1 workspace: AI drafts, auto-replies and widget answers run there for new mail.',
    });
  });

  // FE audit pass 14, LOW: the regular limit in force after the save picks the advice — the
  // override typed, or the platform's when the field is left blank.
  it.each([
    ['a regular override of 0 typed', budget(), budgets, '0', { regularTokensPerDay: 0 }],
    [
      'a regular override cleared to follow a platform regular limit of 0',
      budget({ override: { kbTokensPerDay: 5_000_000, regularTokensPerDay: 9 } }),
      { ...budgets, regular: { limit: 0, source: 'default' as const } },
      '',
      { regularTokensPerDay: null },
    ],
  ])(
    '%s, regular notice not updated: no "raise it" advice',
    async (_, value, platform, typed, edit) => {
      saveAnswer = null;
      regularAnswer = {
        error: 'The regular-limit notices could not be updated now; they clear at 00:00 UTC.',
      };
      renderDialog(value, platform);
      fireEvent.change(screen.getByLabelText('Regular work (tokens per UTC day)'), {
        target: { value: typed },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(toasts).toHaveLength(1));
      expect(sent[0]).toEqual(edit);
      expect(toasts[0].description).toContain('the regular limit is now off (0)');
      expect(toasts[0].description).not.toMatch(/raising the regular limit/);
    }
  );

  it('a KB release and a failed regular release in one save: both said, KB first, as a warning (R12)', async () => {
    // The service's normalised shape (this mock bypasses normaliseRelease).
    saveAnswer = {
      releasedOrganizations: [7],
      stillPaused: [],
      promotedKbJobs: 3,
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
    regularAnswer = {
      error: 'The regular-limit notices could not be updated now; they clear at 00:00 UTC.',
    };
    renderDialog();
    fireEvent.change(screen.getByLabelText('Regular work (tokens per UTC day)'), {
      target: { value: '3000000' },
    });
    fireEvent.change(screen.getByLabelText('KB processing (tokens per UTC day)'), {
      target: { value: '9000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0].kind).toBe('warning');
    expect(toasts[0].description).toMatch(
      /^The KB limit no longer pauses 1 workspace\. 3 parked conversations queued to continue\. The regular-limit notices could not be updated now; they clear at 00:00 UTC\. New AI work follows the saved limit; only the regular-limit notice may keep saying AI work is stopped/
    );
  });
});
