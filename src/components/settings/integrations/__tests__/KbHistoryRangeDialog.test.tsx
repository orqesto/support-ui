/* eslint-disable max-lines */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type {
  KbRangeApplied,
  KbRangeCount,
  KbRangeDryRun,
  KbRangePolicy,
  KbRangeRequest,
  KbRangeResult,
} from '@/services/kbRangeTypes';
import type { AlertState } from '@/components/settings/integrations/types';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';

/** Plain functions, not module-level vi.fn (a rejection from one fails the test even when caught). */
let handler: (id: number, body: KbRangeRequest) => Promise<KbRangeResult> = () =>
  Promise.reject(new Error('no handler'));
let calls: KbRangeRequest[] = [];
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    kbHistoryRange: (id: number, body: KbRangeRequest) => {
      calls.push(body);
      return handler(id, body);
    },
  },
}));

// A native stand-in so an option can be chosen without driving react-select's menu.
vi.mock('@/components/ui/Select', () => ({
  Select: ({
    label,
    value,
    onChange,
    options,
    disabled,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string; isDisabled?: boolean }>;
    disabled?: boolean;
  }) => (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.isDisabled}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const { KbHistoryRangeDialog } = await import('../KbHistoryRangeDialog');
const copy = await import('../kbRangeCopy');

const opt = (days: number, current: number, selectable = true) => ({
  days,
  label: days === 0 ? 'All time' : `${days} days`,
  isCurrent: days === current,
  selectable,
});
const policy = (over: Partial<KbRangePolicy> = {}): KbRangePolicy => ({
  sourceId: 5,
  type: 'gmail',
  name: 'orders@acme.test',
  enabled: true,
  kbCutoff: '2026-09-01T00:00:00Z',
  currentDays: 30,
  options: [7, 30, 90, 180, 365, 0].map((dayCount) => opt(dayCount, 30)),
  planMaxHistoryDays: null,
  sweepInProgress: false,
  lastSweep: {
    state: 'complete',
    at: null,
    capSkipped: null,
    threadsWaiting: null,
    aiSkipped: null,
    aiReason: null,
    aiIncompleteSince: null,
    pausedUntil: null,
  },
  blocked: null,
  openWindowDays: 3,
  kbLimitReachedToday: false,
  aiMode: 'managed',
  aiUnavailable: null,
  ...over,
});
const count = (over: Partial<KbRangeCount> = {}): KbRangeCount => ({
  inRange: 449,
  inOdly: 67,
  toFetch: 382,
  unverifiable: 0,
  notCompared: 0,
  capped: false,
  cappedBy: null,
  timedOut: false,
  approximate: false,
  from: null,
  to: null,
  ...over,
});
const dry = (over: Partial<KbRangeDryRun> = {}): KbRangeDryRun => ({
  ...policy(),
  days: 90,
  direction: 'wider',
  history: count(),
  recent: count({ inRange: 10, inOdly: 7, toFetch: 3 }),
  estimate: {
    newThreads: 287,
    backlogThreads: 40,
    threadsToMine: 327,
    threadsBasis: 'distinct_threads',
    tokensPerThread: 1000,
    estimatedTokens: 327000,
    daysAtLimit: 1,
    limit: 500000,
    spentToday: 0,
    enforced: true,
  },
  room: { storedMessages: null, kbItems: null, projectedSkipped: 0, kbFull: false },
  aiAllowance: { callsLeftThisMonth: null, estimatedCalls: null, short: false },
  ...over,
});
const applied = (over: Partial<KbRangeApplied> = {}): KbRangeApplied => ({
  applied: true,
  days: 90,
  direction: 'wider',
  sweepRequested: true,
  restarted: false,
  importRunStarted: true,
  ...over,
});
const isPolicy = (body: KbRangeRequest) => body.days === undefined;
const isDry = (body: KbRangeRequest) => body.days !== undefined && !body.apply;

const err = (status: number, code?: string, message = 'server said') =>
  Object.assign(new Error(message), { status, data: code ? { code, error: message } : {} });

let onClose: () => void;
let onShowAlert: Mock<(alert: AlertState) => void>;
let onApplied: Mock<(done: KbRangeApplied) => void>;
const mount = (type: 'gmail' | 'email' = 'gmail') =>
  render(
    <KbHistoryRangeDialog
      source={{ id: 5, name: 'orders@acme.test', type }}
      onClose={onClose}
      onShowAlert={onShowAlert}
      onApplied={onApplied}
    />
  );
const selectDays = (days: string) =>
  fireEvent.change(screen.getByLabelText('Read history from'), { target: { value: days } });
const check = () => fireEvent.click(screen.getByRole('button', { name: 'Check' }));
const ready = async () => screen.findByLabelText('Read history from');
const defaultHandler =
  (first = policy(), second = dry(), third = applied()) =>
  (_id: number, body: KbRangeRequest): Promise<KbRangeResult> =>
    Promise.resolve(isPolicy(body) ? first : body.apply ? third : second);

beforeEach(() => {
  calls = [];
  onClose = vi.fn();
  onShowAlert = vi.fn<(alert: AlertState) => void>();
  onApplied = vi.fn<(done: KbRangeApplied) => void>();
  handler = defaultHandler();
  useProcessingPanelStore.getState().reset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('KbHistoryRangeDialog', () => {
  it('shows Loading while the policy loads, then the intro line', async () => {
    mount();
    expect(screen.getByText(copy.KB_RANGE_LOADING)).toBeTruthy();
    await ready();
    expect(screen.getByText(/mining conversations received before/)).toBeTruthy();
  });

  it('options limited to the plan; IMAP no All time, <= 365', async () => {
    handler = defaultHandler(
      policy({ options: [7, 30, 90].map((dayCount) => opt(dayCount, 30)), planMaxHistoryDays: 90 })
    );
    mount();
    const select = await ready();
    expect(Array.from(select.querySelectorAll('option')).map((item) => item.value)).toEqual([
      '7',
      '30',
      '90',
    ]);
    expect(screen.getByText('Your plan reads at most 90 days of history.')).toBeTruthy();
  });

  it('IMAP: the options are exactly the policy list (no All time)', async () => {
    handler = defaultHandler(
      policy({ type: 'email', options: [7, 30, 90, 180, 365].map((dayCount) => opt(dayCount, 30)) })
    );
    mount('email');
    const select = await ready();
    const values = Array.from(select.querySelectorAll('option')).map((item) => item.value);
    expect(values).not.toContain('0');
    expect(values[values.length - 1]).toBe('365');
  });

  it('D12: current 1 day is selected and shown', async () => {
    handler = defaultHandler(policy({ currentDays: 1, options: [opt(7, 1), opt(30, 1)] }));
    mount();
    const select = (await ready()) as HTMLSelectElement;
    expect(select.value).toBe('1');
    expect(
      screen.getByRole('option', { name: `${copy.rangeLabel(1)}${copy.KB_RANGE_CURRENT_SUFFIX}` })
    ).toBeTruthy();
  });

  it('D12: current above the plan is disabled and not the default', async () => {
    handler = defaultHandler(
      policy({
        currentDays: 365,
        planMaxHistoryDays: 90,
        options: [
          opt(7, 365),
          opt(90, 365),
          { days: 365, label: '365 days', isCurrent: true, selectable: false },
        ],
      })
    );
    mount();
    const select = (await ready()) as HTMLSelectElement;
    expect(select.value).toBe('90');
    const current = screen.getByRole('option', { name: /365 days.*above your plan/ });
    expect((current as HTMLOptionElement).disabled).toBe(true);
  });

  it('blocked source: shows the reason, no intro, Check disabled', async () => {
    handler = defaultHandler(
      policy({
        blocked: { code: 'MINING_OFF', message: 'Mining is off for this mailbox: verbatim.' },
      })
    );
    mount();
    await screen.findByText('Mining is off for this mailbox: verbatim.');
    expect(screen.queryByText(/mining conversations received before/)).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Check' }).disabled).toBe(true);
  });

  it("type 'other' skips the intro", async () => {
    handler = defaultHandler(
      policy({
        type: 'other',
        options: [],
        currentDays: 0,
        blocked: { code: 'UNSUPPORTED_SOURCE_TYPE', message: 'Gmail and IMAP only.' },
      })
    );
    mount();
    await screen.findByText('Gmail and IMAP only.');
    expect(screen.queryByText(/mining conversations received before/)).toBeNull();
  });

  it('renders the staging-proof result and the recent line', async () => {
    mount();
    await ready();
    selectDays('90');
    check();
    await screen.findByText(/449 messages/);
    expect(screen.getByText(/67 already in Odly/)).toBeTruthy();
    expect(screen.getByText(/382 to fetch/)).toBeTruthy();
    expect(screen.getByText(/327,000 tokens/)).toBeTruthy();
    expect(screen.getByText(/1,000 per conversation/)).toBeTruthy();
    expect(screen.getByText(/287 with newly fetched mail \+ 40 already imported/)).toBeTruthy();
    expect(screen.getByText(/Recent re-check \(last 90 days\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Read 385 messages' })).toBeTruthy();
  });

  it('estimate null => not measured, never 0', async () => {
    handler = defaultHandler(policy(), dry({ estimate: null }));
    mount();
    await ready();
    selectDays('90');
    check();
    await screen.findByText(/not measured yet/);
    expect(screen.queryByText(/≈0 tokens/)).toBeNull();
  });

  it('capped / approximate / timedOut change the wording and the confirm label', async () => {
    handler = defaultHandler(
      policy(),
      dry({ history: count({ capped: true, cappedBy: 'size', timedOut: true }) })
    );
    mount();
    await ready();
    selectDays('90');
    check();
    await screen.findByText(/at least 449 messages/);
    expect(screen.getByText(/ran out of time/)).toBeTruthy();
    expect(screen.getByText(/At least ≈/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Read the history' })).toBeTruthy();
  });

  it('a capped RECENT count (history not capped) does not let the confirm label understate', async () => {
    handler = defaultHandler(
      policy(),
      dry({
        history: count({ approximate: true }),
        recent: count({ capped: true, cappedBy: 'size' }),
      })
    );
    mount();
    await ready();
    selectDays('90');
    check();
    await screen.findByText(/at least/i);
    expect(screen.getByRole('button', { name: 'Read the history' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Read about/ })).toBeNull();
  });

  it('Confirm is locked while the apply is in flight: disabled, and a second click sends nothing', async () => {
    let finish: (value: KbRangeResult) => void = () => undefined;
    handler = (_id, body) =>
      isPolicy(body)
        ? Promise.resolve(policy())
        : body.apply
          ? new Promise<KbRangeResult>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(dry());
    mount();
    await ready();
    selectDays('90');
    check();
    const confirm = await screen.findByRole('button', { name: /^Read / });
    fireEvent.click(confirm);
    await waitFor(() => expect(calls.filter((body) => body.apply)).toHaveLength(1));
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirm);
    expect(calls.filter((body) => body.apply)).toHaveLength(1);
    await act(() => Promise.resolve(finish(applied())));
  });

  it('approximate count says about', async () => {
    handler = defaultHandler(policy(), dry({ history: count({ approximate: true }) }));
    mount();
    await ready();
    selectDays('90');
    check();
    await screen.findByText(/about 449 messages/);
    expect(screen.getByRole('button', { name: 'Read about 385 messages' })).toBeTruthy();
  });

  it('a missing history count never restores exact wording (null => cannot be estimated)', async () => {
    handler = defaultHandler(policy(), dry({ history: null }));
    mount();
    await ready();
    selectDays('90');
    check();
    await screen.findByText(/cannot be estimated until the mailbox is counted/);
  });

  it('counting shows the spinner line; >= 30 s shows the still-counting line', async () => {
    mount();
    await ready();
    vi.useFakeTimers();
    let release: (v: KbRangeResult) => void = () => undefined;
    handler = (_id, body) =>
      isDry(body) ? new Promise((resolve) => (release = resolve)) : Promise.resolve(policy());
    selectDays('90');
    check();
    expect(screen.getByText(/can take up to a minute/)).toBeTruthy();
    expect(screen.queryByText(/Still counting/)).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(screen.getByText(/Still counting/)).toBeTruthy();
    await act(async () => {
      release(dry());
      await Promise.resolve();
    });
    expect(screen.queryByText(/Still counting/)).toBeNull();
    expect(screen.queryByText(/can take up to a minute/)).toBeNull();
  });

  it('one count at a time', async () => {
    mount();
    await ready();
    let release: (v: KbRangeResult) => void = () => undefined;
    handler = (_id, body) =>
      isDry(body) ? new Promise((resolve) => (release = resolve)) : Promise.resolve(policy());
    selectDays('90');
    check();
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Check' });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(calls.filter(isDry)).toHaveLength(1);
    await act(async () => {
      release(dry());
      await Promise.resolve();
    });
    await screen.findByText(/449 messages/);
  });

  it('a selection change clears a stale result; a late response is ignored', async () => {
    mount();
    await ready();
    selectDays('90');
    check();
    await screen.findByText(/449 messages/);
    selectDays('180');
    expect(screen.queryByText(/449 messages/)).toBeNull();

    let release: (v: KbRangeResult) => void = () => undefined;
    handler = (_id, body) =>
      isDry(body) ? new Promise((resolve) => (release = resolve)) : Promise.resolve(policy());
    check();
    selectDays('365');
    await act(async () => {
      release(dry({ days: 180 }));
      await Promise.resolve();
    });
    expect(screen.queryByText(/449 messages/)).toBeNull();
    // the count has settled, so Check works again for the new selection
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Check' }).disabled).toBe(false);
  });

  it('error texts: 403 / 404 with code / 404 without code / 409 / 5xx unknown', async () => {
    const cases: Array<[unknown, RegExp]> = [
      [err(403), /Manage integrations permission/],
      [err(404, 'SOURCE_NOT_FOUND'), /no longer exists/],
      [err(404), /does not support changing the history range yet/],
      [
        err(409, 'PLAN_INACTIVE', 'This workspace has no active plan, so nothing would be mined.'),
        /no active plan/,
      ],
      [
        err(409, 'COUNT_IN_PROGRESS', 'A count for this mailbox is already running.'),
        /already running/,
      ],
      [
        err(504, 'COUNT_TIMED_OUT', 'The mailbox did not answer in time.'),
        /did not answer in time/,
      ],
      [err(502, 'WHATEVER', 'raw upstream gunk'), /The request failed\. Try again later\./],
    ];
    for (const [error, expected] of cases) {
      handler = (_id, body) =>
        isPolicy(body)
          ? Promise.resolve(policy())
          : Promise.reject(error instanceof Error ? error : new Error('failed'));
      const view = mount();
      await ready();
      selectDays('90');
      check();
      await screen.findByText(expected);
      expect(screen.queryByText('raw upstream gunk')).toBeNull();
      view.unmount();
    }
  });

  it('a policy load failure shows its text', async () => {
    handler = () => Promise.reject(err(404));
    mount();
    await screen.findByText(/does not support changing the history range yet/);
  });

  it('sweep in progress, KB full, last sweep partial/paused/failed lines', async () => {
    handler = defaultHandler(
      policy({
        sweepInProgress: true,
        lastSweep: {
          ...policy().lastSweep,
          state: 'partial',
          capSkipped: { storedMessages: 5, historyWindow: 2 },
        },
      }),
      dry({
        room: {
          storedMessages: { limit: 1000, used: 900, left: 100 },
          kbItems: { limit: 50, used: 50, left: 0 },
          projectedSkipped: 20,
          kbFull: true,
        },
      })
    );
    mount();
    await screen.findByText(/A history read is already running/);
    expect(screen.getByText(/finished partially: 7 messages were/)).toBeTruthy();
    selectDays('90');
    check();
    await screen.findByText(/The knowledge base is full \(50 of 50 items\)/);
    expect(screen.getByText(/About 20 of the 382 would not be stored/)).toBeTruthy();
    cleanup();
    handler = defaultHandler(policy({ lastSweep: { ...policy().lastSweep, state: 'failed' } }));
    mount();
    await screen.findByText(/hit errors/);
    cleanup();
    handler = defaultHandler(policy({ lastSweep: { ...policy().lastSweep, state: 'paused' } }));
    mount();
    await screen.findByText(/paused by today's KB limit/);
  });

  it('narrowing => Save range without Check; D2 copy; no panel', async () => {
    mount();
    await ready();
    selectDays('7');
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    expect(screen.getByText(/keeps everything already in the knowledge base/)).toBeTruthy();
    handler = defaultHandler(
      policy(),
      dry(),
      applied({ days: 7, direction: 'narrower', sweepRequested: false, importRunStarted: false })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: copy.confirmLabel({
          narrower: true,
          capped: false,
          toFetch: 0,
          approximate: false,
          timedOut: false,
        }),
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.filter(isDry)).toHaveLength(0);
    expect(calls[calls.length - 1]).toEqual({ days: 7, apply: true });
    expect(useProcessingPanelStore.getState().opened[5]).toBeUndefined();
    expect(onShowAlert.mock.calls[0][0]).toMatchObject({
      title: 'Range saved',
      variant: 'success',
    });
  });

  it('narrowing from All time is narrowing; widening to All time is not', async () => {
    handler = defaultHandler(
      policy({ currentDays: 0, options: [7, 365, 0].map((dayCount) => opt(dayCount, 0)) })
    );
    mount();
    await ready();
    selectDays('365');
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
  });

  it('G13: confirm sends days + apply + estimate, opens the panel for Gmail, alerts, closes', async () => {
    mount();
    await ready();
    selectDays('90');
    check();
    fireEvent.click(await screen.findByRole('button', { name: 'Read 385 messages' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls[calls.length - 1]).toEqual({
      days: 90,
      apply: true,
      estimate: { historyToFetch: 382, recentToFetch: 3, estimatedTokens: 327000 },
    });
    expect(useProcessingPanelStore.getState().opened[5]).toMatchObject({ reason: 'manual' });
    expect(onShowAlert.mock.calls[0][0]).toMatchObject({
      title: 'History read requested',
      variant: 'success',
    });
    expect(onShowAlert.mock.calls[0][0].description).toMatch(/starting now/);
    expect(onApplied).toHaveBeenCalledWith(expect.objectContaining({ applied: true }));
  });

  it('Gmail with importRunStarted false does not say "starting now"', async () => {
    handler = defaultHandler(policy(), dry(), applied({ importRunStarted: false }));
    mount();
    await ready();
    selectDays('90');
    check();
    fireEvent.click(await screen.findByRole('button', { name: 'Read 385 messages' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onShowAlert.mock.calls[0][0].description).not.toMatch(/starting now/);
  });

  it('IMAP apply with importRunStarted false does NOT announce panel progress or open the panel', async () => {
    handler = defaultHandler(
      policy({
        type: 'email',
        options: [7, 30, 90, 180, 365].map((dayCount) => opt(dayCount, 30)),
      }),
      dry({ type: 'email', recent: null }),
      applied({ importRunStarted: false })
    );
    mount('email');
    await ready();
    selectDays('90');
    check();
    fireEvent.click(await screen.findByRole('button', { name: /^Read/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const text = onShowAlert.mock.calls[0][0].description;
    expect(text).not.toMatch(/starting now/);
    expect(text).not.toMatch(/Progress shows in the processing panel/);
    expect(useProcessingPanelStore.getState().opened[5]).toBeUndefined();
    expect(onApplied).toHaveBeenCalled();
  });

  it('apply failure shows the error text and keeps the dialog open', async () => {
    mount();
    await ready();
    selectDays('90');
    check();
    const confirm = await screen.findByRole('button', { name: 'Read 385 messages' });
    handler = (_id, body) =>
      body.apply
        ? Promise.reject(
            err(
              409,
              'APPLY_IN_PROGRESS',
              'A range change for this mailbox is already being applied.'
            )
          )
        : Promise.resolve(policy());
    fireEvent.click(confirm);
    await screen.findByText(/already being applied/);
    expect(onClose).not.toHaveBeenCalled();
    expect(onShowAlert).not.toHaveBeenCalled();
  });

  it('G14: F4 caveat for Gmail only; allowance warning when short', async () => {
    handler = defaultHandler(
      policy(),
      dry({ days: 0, aiAllowance: { callsLeftThisMonth: 100, estimatedCalls: 360, short: true } })
    );
    mount();
    await ready();
    selectDays('0');
    check();
    await screen.findByText(/Also re-checks mail since the cutoff/);
    expect(screen.getByText(/needs about 360 AI calls; your plan has 100 left/)).toBeTruthy();
    cleanup();
    handler = defaultHandler(
      policy({
        type: 'email',
        options: [7, 30, 90, 180, 365].map((dayCount) => opt(dayCount, 30)),
      }),
      dry({ type: 'email', recent: null })
    );
    mount('email');
    await ready();
    selectDays('90');
    check();
    await screen.findByText(/449 messages/);
    expect(screen.queryByText(/Also re-checks mail/)).toBeNull();
  });

  it('AI unavailable warning from the policy is shown', async () => {
    handler = defaultHandler(
      policy({
        aiUnavailable: { reason: 'provider_quota', message: 'AI is unavailable right now: words.' },
      })
    );
    mount();
    await screen.findByText('AI is unavailable right now: words.');
  });

  it('Cancel closes without calling apply', async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: copy.KB_RANGE_CANCEL }));
    expect(onClose).toHaveBeenCalled();
    expect(calls.some((body) => body.apply)).toBe(false);
  });

  it('Gmail apply opens the processing panel exactly once', async () => {
    const original = useProcessingPanelStore.getState().open;
    let opens = 0;
    useProcessingPanelStore.setState({
      open: (...args: Parameters<typeof original>) => {
        opens += 1;
        original(...args);
      },
    });
    mount();
    await ready();
    selectDays('90');
    check();
    fireEvent.click(await screen.findByRole('button', { name: 'Read 385 messages' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(opens).toBe(1);
    useProcessingPanelStore.setState({ open: original });
  });

  it('unverifiable / notCompared counts get their own sentence', async () => {
    handler = defaultHandler(
      policy(),
      dry({ history: count({ unverifiable: 12, notCompared: 4 }) })
    );
    mount();
    await ready();
    selectDays('90');
    check();
    await screen.findByText(/449 messages/);
    expect(screen.getByText(copy.unverifiableLine(12))).toBeTruthy();
    expect(screen.getByText(copy.notComparedLine(4))).toBeTruthy();
  });

  it('apply with no history count omits historyToFetch (never a made-up 0)', async () => {
    handler = defaultHandler(policy(), dry({ history: null, estimate: null }));
    mount();
    await ready();
    selectDays('90');
    check();
    fireEvent.click(await screen.findByRole('button', { name: /^(Read|Start)/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const sent = calls[calls.length - 1].estimate;
    expect(sent).toBeDefined();
    expect('historyToFetch' in (sent ?? {})).toBe(false);
  });
});
