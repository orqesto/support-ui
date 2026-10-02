/**
 * The Re-mine confirmation and result under the daily KB token limit (audit F1/F2/F8): the
 * confirmation shows the backend's forecast, and a re-mine the limit holds back says it waits
 * for the reset — in the one time style, never "Re-mining started".
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import type { KbMiningForecast } from '@/services/kb.service';

/** Plain functions, not module-level vi.fn (vitest 4 fails a test on their caught rejections). */
let forecast: () => Promise<KbMiningForecast> = () => Promise.reject(new Error('none'));
let reprocess: () => Promise<unknown> = () => Promise.resolve({});
vi.mock('@/services/kb.service', () => ({
  kbService: {
    getMiningForecast: () => forecast(),
    reprocessSource: () => reprocess(),
  },
}));

const { SourceKbStrip } = await import('../SourceKbStrip');

// be-toklim-wt 0d61a3e0 tokenForecastService `KbForecast` (BudgetStanding + backlog), as sent today:
// `enforced` / `enforcementLookupFailed`, the source's `name` (FE fix round 15) and `imageChecks`,
// which `forecastKb` always sends (FE audit pass 16, NIT).
const base: KbMiningForecast = {
  sources: [
    { sourceId: 9, name: 'Support', threadsInScope: 300, threadsToMine: 300, noCutoff: false },
  ],
  threadsToMine: 300,
  tokensPerThread: { value: 2_000, threadsMeasured: 40, windowDays: 30 },
  estimatedTokens: 600_000,
  daysAtLimit: 1,
  limit: { limit: 5_000_000, source: 'default' },
  spentToday: 0,
  enforced: true,
  enforcementLookupFailed: false,
  imageChecks: { firstRecordedAt: '2026-08-01T00:00:00.000Z', coversWindow: true },
};

beforeEach(() => useProcessingPanelStore.getState().reset());
afterEach(cleanup);

const openConfirm = (onShowAlert = vi.fn()) => {
  render(
    <SourceKbStrip
      source={{ id: 9, isKnowledgeBase: true, kbMarkedAt: '2026-09-01T00:00:00Z' }}
      onShowAlert={onShowAlert}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /re-mine/i }));
  return onShowAlert;
};

const dialog = () => screen.getByRole('dialog');

describe('Re-mine confirmation — forecast', () => {
  it('shows the measured cost from the backend', async () => {
    forecast = () => Promise.resolve(base);
    openConfirm();
    await waitFor(() => expect(dialog().textContent).toContain((600_000).toLocaleString()));
    expect(dialog().textContent).toContain('measured on this workspace');
  });

  it('a mailbox with no KB cutoff: says a cutoff must be set, not "already mined"', async () => {
    forecast = () =>
      Promise.resolve({
        ...base,
        sources: [{ sourceId: 9, threadsInScope: 0, threadsToMine: 0, noCutoff: true }],
        threadsToMine: 0,
      });
    openConfirm();
    await waitFor(() => expect(dialog().textContent).toContain('no KB cutoff'));
    expect(dialog().textContent).not.toContain('already mined');
  });

  it('image checks not covering the window: says it may cost more (A2)', async () => {
    // Pinned zone + an instant near midnight UTC (FE audit pass 13, NIT): 23:30 UTC on Sep 30 is
    // Oct 1 in Tokyo, so a local date and a UTC one differ — at 08:00 UTC they matched in most
    // zones and a `timeZone: 'UTC'` mutation stayed green.
    const before = process.env.TZ;
    process.env.TZ = 'Asia/Tokyo';
    try {
      const at = '2026-09-30T23:30:00.000Z';
      forecast = () =>
        Promise.resolve({ ...base, imageChecks: { firstRecordedAt: at, coversWindow: false } });
      openConfirm();
      // The cutoff beside it is the reader's local date: the image-check date uses the same
      // convention, labelled (pass 12 NIT) — never a bare UTC "2026-09-30".
      const options = { year: 'numeric', month: 'short', day: 'numeric' } as const;
      const local = new Date(at).toLocaleDateString(undefined, options);
      const utc = new Date(at).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
      expect(local).not.toBe(utc);
      expect(local).toBe(
        new Date(at).toLocaleDateString(undefined, { ...options, timeZone: 'Asia/Tokyo' })
      );
      await waitFor(() =>
        expect(dialog().textContent).toContain(
          `Image checks during mining are counted from when they were first recorded for this workspace (${local}, your time); any made before then are not in this figure, so it may cost more.`
        )
      );
      expect(dialog().textContent).not.toContain(`(${utc}, your time)`);
      expect(dialog().textContent).not.toContain('(2026-09-30)');
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  it('no image check recorded yet: names the first-recorded rule, never "a recent release" (pass 11)', async () => {
    // be-toklim-wt 415635b0 forecastKb: firstRecordedAt null when no kb_vision row exists — true for
    // good on a workspace whose mail has no images, so no release-relative wording.
    forecast = () =>
      Promise.resolve({ ...base, imageChecks: { firstRecordedAt: null, coversWindow: false } });
    openConfirm();
    await waitFor(() =>
      expect(dialog().textContent).toContain(
        'Image checks during mining are counted from when they were first recorded, and none has been recorded for this workspace yet; if mining reads images, it may cost more.'
      )
    );
    expect(dialog().textContent).not.toContain('release');
  });

  it('CONTROL: image checks covering the window add no caveat (A2)', async () => {
    forecast = () =>
      Promise.resolve({
        ...base,
        imageChecks: { firstRecordedAt: '2026-08-01T00:00:00.000Z', coversWindow: true },
      });
    openConfirm();
    await waitFor(() => expect(dialog().textContent).toContain('measured on this workspace'));
    expect(dialog().textContent).not.toContain('Image checks');
  });

  it('a failed forecast says so — never a zero', async () => {
    forecast = () => Promise.reject(new Error('404'));
    openConfirm();
    await waitFor(() => expect(dialog().textContent).toContain('no estimate could be loaded'));
  });
});

describe('Re-mine held back by the daily KB limit', () => {
  const confirmButton = () => {
    const button = screen
      .getAllByRole('button')
      .find((item) => item.textContent === 'Re-mine' && item.closest('[role="dialog"]'));
    if (!button) throw new Error('no confirm button');
    return button;
  };

  it('says it waits for the reset, with UTC and local time', async () => {
    forecast = () => Promise.resolve(base);
    reprocess = () =>
      Promise.resolve({
        data: { messageSourceId: 9, paused: true, resumesAt: '2026-10-01T00:07:00.000Z' },
      });
    const onShowAlert = openConfirm();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    const alert = onShowAlert.mock.calls[0][0] as { title: string; description: string };
    expect(alert.title).toBe('Re-mining starts after the daily reset');
    // "From", with the day: the restart waits while the limit is spent, so no later time is a
    // promise (A8), and the reset may not be today in the reader's zone.
    expect(alert.description).toMatch(
      /starts by itself from 00:07 UTC on 2026-10-01 \(\d\d:\d\d your time\)\./
    );
  });

  it('nothing in scope: never "started" — says there is nothing to read (A8)', async () => {
    forecast = () =>
      Promise.resolve({
        ...base,
        sources: [{ sourceId: 9, threadsInScope: 0, threadsToMine: 0, noCutoff: false }],
        threadsToMine: 0,
      });
    reprocess = () => Promise.resolve({ data: { messageSourceId: 9 } });
    const onShowAlert = openConfirm();
    await waitFor(() => expect(dialog().textContent).toContain('No imported conversation'));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    const alert = onShowAlert.mock.calls[0][0] as { title: string; description: string };
    expect(alert.title).toBe('Nothing to re-mine');
    expect(alert.description).toMatch(/nothing to read/);
  });

  it('confirmed while the forecast is still loading: never "started" for what may be nothing (pass 11 NIT)', async () => {
    forecast = () => new Promise(() => {});
    reprocess = () => Promise.resolve({ data: { messageSourceId: 9 } });
    const onShowAlert = openConfirm();
    expect(dialog().textContent).toContain('Working out how many');
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    const alert = onShowAlert.mock.calls[0][0] as { title: string; description: string };
    expect(alert.title).toBe('Re-mining requested');
    expect(alert.description).toMatch(/^Any conversations in scope that are not mined yet/);
  });

  it('everything in scope already mined: the toast agrees with the dialog — never "started … being re-read" (pass 12)', async () => {
    for (const answer of [
      // be 64d8d228 tokenForecastService: in scope, all mined.
      {
        ...base,
        sources: [{ sourceId: 9, threadsInScope: 300, threadsToMine: 0, noCutoff: false }],
        threadsToMine: 0,
      },
      // An older backend: no `sources`, nothing to mine.
      { ...base, sources: undefined, threadsToMine: 0 },
    ]) {
      forecast = () => Promise.resolve(answer);
      reprocess = () => Promise.resolve({ data: { messageSourceId: 9 } });
      const onShowAlert = openConfirm();
      await waitFor(() => expect(dialog().textContent).toMatch(/already mined|skips mined ones/));
      fireEvent.click(confirmButton());
      await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
      const alert = onShowAlert.mock.calls[0][0] as { title: string; description: string };
      expect(alert.title).toBe('Re-mining requested');
      expect(alert.description).toMatch(
        /^Conversations already mined are skipped unless they changed since/
      );
      expect(alert.description).not.toContain('being re-read');
      cleanup();
    }
  });

  it('CONTROL: an unpaused re-mine with conversations in scope reports that it started', async () => {
    forecast = () => Promise.resolve(base);
    reprocess = () => Promise.resolve({ data: { messageSourceId: 9 } });
    const onShowAlert = openConfirm();
    await waitFor(() => expect(dialog().textContent).not.toContain('Working out how many'));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect((onShowAlert.mock.calls[0][0] as { title: string }).title).toBe('Re-mining started');
  });

  /**
   * The re-mine 409 as the api-client interceptor rejects it: the message from the body, `status`,
   * and `data` = the untouched body (be-toklim-wt 2b678d40 knowledgeBaseController).
   */
  const refused = (reason: string, message: string) => {
    const error = new Error(message) as Error & { status?: number; data?: unknown };
    error.status = 409;
    error.data = { success: false, message, data: { messageSourceId: 9, reason } };
    return error;
  };

  it('R8: a same-id mailbox mining in another workspace is said — not "too many re-mines"', async () => {
    forecast = () => Promise.resolve(base);
    reprocess = () =>
      Promise.reject(
        refused(
          'source-busy-elsewhere',
          'Too many re-mines are running right now — try again once one finishes.'
        )
      );
    const onShowAlert = openConfirm();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    const alert = onShowAlert.mock.calls[0][0] as { title: string; description: string };
    expect(alert.title).toBe('Could not start re-mining');
    expect(alert.description).toMatch(/^A mailbox in another workspace is being mined right now/);
    expect(alert.description).not.toContain('Too many re-mines');
  });

  it('CONTROL: a real "too many" refusal keeps the backend sentence', async () => {
    forecast = () => Promise.resolve(base);
    reprocess = () =>
      Promise.reject(
        refused(
          'global-limit',
          'Too many re-mines are running right now — try again once one finishes.'
        )
      );
    const onShowAlert = openConfirm();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect((onShowAlert.mock.calls[0][0] as { description: string }).description).toBe(
      'Too many re-mines are running right now — try again once one finishes.'
    );
  });
});

describe('mining forecast — saved limit unreadable (BE R17 settingsLookupFailed)', () => {
  it('the days are said to be counted against the built-in default', async () => {
    const { describeMiningCost } = await import('../SourceKbStrip');
    const text = describeMiningCost({ ...base, daysAtLimit: 4, settingsLookupFailed: true });
    expect(text).toContain(
      'At the daily KB limit that takes about 4 days; it pauses each day at the limit and resumes after the reset at'
    );
    expect(text).toContain(
      'The saved KB limit could not be read, so this is counted against the built-in default.'
    );
  });

  // FE audit pass 18, LOW: with the env limit set the BE falls back to it, not the default.
  it('the env limit set: counted against the server environment setting', async () => {
    const { describeMiningCost } = await import('../SourceKbStrip');
    const text = describeMiningCost({
      ...base,
      daysAtLimit: 4,
      settingsLookupFailed: true,
      limit: { limit: 2_000_000, source: 'env' },
    });
    expect(text).toContain(
      'The saved KB limit could not be read, so this is counted against the server environment setting.'
    );
    expect(text).not.toContain('default');
  });

  // FE audit pass 18, NIT: "It fits in today’s KB limit" stated a fact about the unread limit.
  it('one day with the flag: fits in a day at the fallback, never "today’s KB limit"', async () => {
    const { describeMiningCost } = await import('../SourceKbStrip');
    const text = describeMiningCost({ ...base, daysAtLimit: 1, settingsLookupFailed: true });
    expect(text).toContain(
      'It fits in one day at the built-in default for KB processing; the saved KB limit could not be read.'
    );
    expect(text).not.toContain('today’s KB limit');
  });

  // FE audit pass 20, NIT: beside an unsettled enforcement "could not be read" came twice — the
  // fallback clause once, with why, as the console says it.
  it('beside an unsettled enforcement: "could not be read" once', async () => {
    const { describeMiningCost } = await import('../SourceKbStrip');
    const text = describeMiningCost({
      ...base,
      daysAtLimit: 4,
      settingsLookupFailed: true,
      enforced: false,
      enforcementLookupFailed: true,
    });
    expect(text).toContain(
      'That is about 4 days of the daily KB limit (counted against the built-in default — the saved KB limit could not be read); whether the limit stops work is unknown.'
    );
    expect(text.match(/could not be read/g)).toHaveLength(1);
  });

  it('CONTROL: a stored platform figure beside the flag is not qualified', async () => {
    const { describeMiningCost } = await import('../SourceKbStrip');
    const text = describeMiningCost({
      ...base,
      daysAtLimit: 1,
      settingsLookupFailed: true,
      limit: { limit: 2_000_000, source: 'platform' },
    });
    expect(text).toContain('It fits in today’s KB limit.');
    expect(text).not.toContain('could not be read');
  });

  // Pass 22, NIT (parity with the console's forecast): the env limit is 0 — no limit, so the BE
  // sends no days — and the saved limit could not be read: "no limit" is the fallback's, said so.
  it('the env fallback is 0 (no limit): said as the fallback layer having none', async () => {
    const { describeMiningCost } = await import('../SourceKbStrip');
    const text = describeMiningCost({
      ...base,
      daysAtLimit: null,
      settingsLookupFailed: true,
      limit: { limit: 0, source: 'env' },
    });
    expect(text).toContain(
      'There is no KB limit under the server environment setting; the saved KB limit could not be read.'
    );
    // CONTROL: the same 0 read fine (the workspace's own "no limit") adds no days sentence.
    expect(
      describeMiningCost({
        ...base,
        daysAtLimit: null,
        settingsLookupFailed: false,
        limit: { limit: 0, source: 'workspace' },
      })
    ).not.toContain('KB limit');
  });

  it('CONTROL: read fine — no fallback note', async () => {
    const { describeMiningCost } = await import('../SourceKbStrip');
    expect(
      describeMiningCost({ ...base, daysAtLimit: 4, settingsLookupFailed: false })
    ).not.toContain('could not be read');
  });
});
