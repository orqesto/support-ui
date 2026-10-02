/**
 * "Daily AI limit reached" in the bell (audit F3/F8/F12): the hook keeps only its own kind and
 * badges only notices still in force; the section writes an earlier day's notice in the past
 * tense, tells a workspace admin WHO can raise the limit, and writes times in one style.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import type { TokenLimitAlert } from '@/hooks/useTokenLimitAlerts';

let rows: unknown[] = [];
let getImpl: () => Promise<unknown> = () =>
  Promise.resolve({ data: { data: { notifications: rows } } });
let orgId = 4;
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: () => getImpl(),
    patch: () => Promise.resolve({ data: {} }),
  },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => null,
  releaseSocket: () => {},
  subscribeToEvent: () => {},
  unsubscribeFromEvent: () => {},
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: orgId, user: { organizationId: orgId } }),
}));

const { useTokenLimitAlerts } = await import('@/hooks/useTokenLimitAlerts');
const { TokenLimitSection } = await import('../TokenLimitSection');

const HOUR = 60 * 60 * 1000;
const row = (id: number, resetsAt: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'ai_token_limit_reached',
  details: {
    title: 'Daily AI limit for KB processing reached',
    bucket: 'kb',
    spent: 5_000_100,
    limit: 5_000_000,
    enforced: true,
    resetsAt,
    effect: 'Knowledge-base mining is paused and resumes with AI after the reset.',
    ...extra,
  },
});
const future = () => new Date(Date.now() + 3 * HOUR).toISOString();
const past = () => new Date(Date.now() - 3 * HOUR).toISOString();

const Label = ({ children }: { children: React.ReactNode }) => <span>{children}</span>;

const answer = (list: unknown[]) => Promise.resolve({ data: { data: { notifications: list } } });

beforeEach(() => {
  rows = [];
  orgId = 4;
  getImpl = () => answer(rows);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useTokenLimitAlerts', () => {
  it('keeps only its own kind and badges only notices still in force (F3)', async () => {
    rows = [row(1, future()), row(2, past()), { id: 3, kind: 'sla_message_breach', details: {} }];
    const { result } = renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(2));
    expect(result.current.badged).toBe(1);
  });

  it('a notice a limit save released is not badged, whatever its day (R4)', async () => {
    rows = [
      row(1, future(), { releasedAt: past() }),
      row(2, future(), { releasedAt: 'not a date' }),
      row(3, future()),
    ];
    const { result } = renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(3));
    expect(result.current.badged).toBe(2);
    expect(result.current.alerts.find((alert) => alert.id === 2)?.releasedAt).toBeNull();
  });

  it('a PARTIAL release stays badged; a full one and a malformed one do not (pass 7)', async () => {
    rows = [
      row(1, future(), { releasedAt: past(), partial: true, releaseKind: 'mining' }),
      row(2, future(), { releasedAt: past(), partial: false, releaseKind: 'mining' }),
      row(4, future(), { releasedAt: past(), partial: 'yes', releaseKind: 'other' }),
    ];
    const { result } = renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(3));
    expect(result.current.badged).toBe(1);
    const byId = (id: number) => result.current.alerts.find((alert) => alert.id === id);
    expect(byId(1)?.releasePartial).toBe(true);
    expect(byId(2)?.releaseKind).toBe('mining');
    // Each field read by its type: a wrongly typed one is not known.
    expect(byId(4)?.releasePartial).toBeNull();
    expect(byId(4)?.releaseKind).toBeNull();
  });

  it('a notice without a reset time counts as current', async () => {
    rows = [row(1, null)];
    const { result } = renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.badged).toBe(1);
  });
});

describe('useTokenLimitAlerts across time and workspaces', () => {
  it('a notice leaves the badge at its reset without a new poll (A6)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    rows = [row(1, future())];
    const { result } = renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(result.current.badged).toBe(1));
    await act(() => vi.advanceTimersByTimeAsync(3 * HOUR + 1000));
    expect(result.current.badged).toBe(0);
  });

  it("another workspace: the previous one's notices go, even when its fetch fails (A5)", async () => {
    rows = [row(1, future())];
    const { result, rerender } = renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    orgId = 5;
    getImpl = () => Promise.reject(new Error('offline'));
    rerender();
    await waitFor(() => expect(result.current.alerts).toHaveLength(0));
  });

  it('a late answer for the previous workspace is dropped (A5)', async () => {
    let answerOld: (value: unknown) => void = () => {};
    getImpl = () => new Promise((resolve) => (answerOld = resolve));
    const { result, rerender } = renderHook(() => useTokenLimitAlerts());
    orgId = 5;
    getImpl = () => answer([]);
    rerender();
    answerOld({ data: { data: { notifications: [row(1, future())] } } });
    await act(() => Promise.resolve());
    expect(result.current.alerts).toHaveLength(0);
  });
});

describe('TokenLimitSection', () => {
  const renderSection = (
    resetsAt: string | null,
    releasedAt: string | null = null,
    extra: Partial<TokenLimitAlert> = {}
  ) => {
    const alert: TokenLimitAlert = {
      id: 1,
      bucket: 'kb',
      title: 'Daily AI limit for KB processing reached',
      spent: 5_000_100,
      limit: 5_000_000,
      enforced: true,
      resetsAt,
      effect: 'Knowledge-base mining is paused and resumes with AI after the reset.',
      releasedAt,
      // The backend writes the check time with every release (markLimitNoticeReleased).
      checkedAt: releasedAt,
      releasePartial: null,
      releaseKind: null,
      releaseCause: 'limit_setting',
      ...extra,
    };
    render(
      <TokenLimitSection
        alerts={[alert]}
        dismiss={() => {}}
        showLabel={false}
        SectionLabel={Label}
      />
    );
  };

  it('today: the effect, who can raise it, and the reset in UTC + local time (F8, F12)', () => {
    renderSection('2099-10-01T00:00:00.000Z');
    expect(screen.getByText(/mining is paused/)).toBeInTheDocument();
    expect(
      screen.getByText(/Only your platform administrator can change this limit/)
    ).toBeInTheDocument();
    expect(screen.getByText(/^Resets at 00:00 UTC \(\d\d:\d\d your time\)\.$/)).toBeInTheDocument();
    expect(screen.getByText(/used today/)).toBeInTheDocument();
  });

  it('an earlier day: past tense, no present-tense effect, no "used today" (F3)', () => {
    renderSection(past());
    expect(screen.getByText(/was reached on an earlier day/)).toBeInTheDocument();
    expect(screen.getByText(/were used that day/)).toBeInTheDocument();
    expect(screen.queryByText(/mining is paused/)).toBeNull();
    expect(screen.queryByText(/used today/)).toBeNull();
    expect(screen.queryByText(/^Resets at/)).toBeNull();
  });

  it('released by a limit save: a record — no "is paused", no advice, no reset line (R4)', () => {
    renderSection('2099-10-01T00:00:00.000Z', '2026-09-30T12:05:00.000Z', {
      releasePartial: false,
      releaseKind: 'mining',
    });
    expect(
      screen.getByText(
        'Daily AI limit for KB processing was reached; it no longer pauses this workspace'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /^Paused knowledge-base mining was queued to continue\. Knowledge-base consolidation makes proposals again from its next nightly run\.$/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /^A limit setting changed; checked at 12:05 UTC on 2026-09-30 \(\d\d:\d\d your time\); this notice is only a record\.$/
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/is paused/)).toBeNull();
    expect(screen.queryByText(/Only your platform administrator/)).toBeNull();
    expect(screen.queryByText(/^Resets at/)).toBeNull();
  });

  it('a PARTIAL release says some may still wait, and keeps the reset line (pass 7)', () => {
    renderSection('2099-10-01T00:00:00.000Z', '2026-09-30T12:05:00.000Z', {
      releasePartial: true,
      releaseKind: 'mining',
    });
    expect(screen.getByText(/though some may still wait for the reset/)).toBeInTheDocument();
    // BE round 21 (B9): partial is also a promote that failed — no cause is blamed on the amount.
    expect(screen.getByText(/\(not all of it could be released at once\)/)).toBeInTheDocument();
    expect(screen.queryByText(/too much was paused/)).toBeNull();
    expect(
      screen.getByText(
        /^A limit setting changed; checked at 12:05 UTC on 2026-09-30 \(\d\d:\d\d your time\)\. Resets at 00:00 UTC/
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/only a record/)).toBeNull();
    expect(screen.queryByText(/is paused/)).toBeNull();
  });

  it('a notice-only release says nothing was parked — never that paused work was queued (pass 7)', () => {
    renderSection('2099-10-01T00:00:00.000Z', '2026-09-30T12:05:00.000Z', {
      releasePartial: false,
      releaseKind: 'notice_only',
    });
    expect(
      screen.getByText(
        /^No paused knowledge-base mining was waiting here\. Knowledge-base consolidation makes proposals again from its next nightly run\.$/
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/queued to continue/)).toBeNull();
    expect(screen.queryByText(/released/)).toBeNull();
  });

  it('a PARTIAL notice-only release says the search stopped early and keeps the reset line (pass 9)', () => {
    renderSection('2099-10-01T00:00:00.000Z', '2026-09-30T12:05:00.000Z', {
      releasePartial: true,
      releaseKind: 'notice_only',
    });
    expect(
      screen.getByText(
        /^No paused knowledge-base mining was found to continue, though the search stopped early: some may still wait for the reset\. Knowledge-base consolidation/
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/\. Resets at 00:00 UTC/)).toBeInTheDocument();
    expect(screen.queryByText(/was paused here/)).toBeNull();
    expect(screen.queryByText(/queued to continue/)).toBeNull();
    expect(screen.queryByText(/only a record/)).toBeNull();
  });

  it('the dismiss tooltip promises no day: a notice returns when the limit is reached again (pass 9)', () => {
    renderSection('2099-10-01T00:00:00.000Z', null, {});
    const button = screen.getByRole('button', { name: 'Dismiss this alert' });
    expect(button).toHaveAttribute(
      'title',
      'Dismiss — hides this notice until the limit is reached again'
    );
  });

  it('measured only: no advice to raise a limit the reader cannot edit (A7)', () => {
    render(
      <TokenLimitSection
        alerts={[
          {
            id: 1,
            bucket: 'regular',
            title: 'Daily AI limit for regular work reached',
            spent: 3_000_000,
            limit: 2_000_000,
            enforced: false,
            resetsAt: '2099-10-01T00:00:00.000Z',
            effect:
              'Nothing has been stopped: this workspace runs on its own AI key and the limit is only measured. Review the limit, or raise it.',
            releasedAt: null,
            checkedAt: null,
            releasePartial: null,
            releaseKind: null,
            releaseCause: 'limit_setting',
          },
        ]}
        dismiss={() => {}}
        showLabel={false}
        SectionLabel={Label}
      />
    );
    expect(screen.getByText(/tell your platform administrator/)).toBeInTheDocument();
    expect(screen.queryByText(/raise it/)).toBeNull();
  });
});

describe('TokenLimitSection: a released REGULAR notice (audit pass 12, MED P12-F1)', () => {
  // The BE shape at be-toklim-wt b046e2f9: tokenBudgetAlerts EFFECT.regular (enforced) and
  // markRegularLimitNoticeReleased — details keep title/figures, gain `releasedAt`,
  // `effect` = regularLimitReleasedEffect, `partial: false`, `releaseKind: 'regular'`.
  const regular = (extra: Record<string, unknown> = {}) => ({
    id: 7,
    kind: 'ai_token_limit_reached',
    details: {
      title: 'Daily AI limit for regular work reached',
      bucket: 'regular',
      spent: 2_000_100,
      limit: 2_000_000,
      enforced: true,
      resetsAt: '2099-10-01T00:00:00.000Z',
      effect:
        "New mail is still sorted and spam-checked by the local model; AI drafts, auto-replies and widget answers stop until the reset. After the reset, open conversations handled this way may be analysed again with AI — best effort, using at most half of the next day's regular limit; any not re-analysed that day, or refused because the limit is reached again, keep the local model's result.",
      ...extra,
    },
  });
  const show = async () => {
    const { result } = renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    render(
      <TokenLimitSection
        alerts={result.current.alerts}
        dismiss={() => {}}
        showLabel={false}
        SectionLabel={Label}
      />
    );
    return result.current;
  };

  it('released: past tense, no KB mining words, not badged, muted icon', async () => {
    rows = [
      regular({
        releasedAt: '2026-09-30T12:05:00.000Z',
        checkedAt: '2026-09-30T12:05:00.000Z',
        effect:
          'Since a limit setting changed at 12:05 UTC, the regular-work limit no longer stops this workspace: AI drafts, auto-replies and widget answers run again for new mail. ' +
          "Mail the local model sorted while the limit was reached is not re-run now: after the reset, open conversations handled this way may be analysed again with AI — best effort, using at most half of the next day's regular limit; any not re-analysed that day, or refused because the limit is reached again, keep the local model's result.",
        partial: false,
        releaseKind: 'regular',
        // be-toklim-wt 87e83d02 markRegularLimitNoticeReleased (round 13): the release a save ran.
        releaseCause: 'limit_setting',
      }),
    ];
    const hook = await show();
    expect(hook.badged).toBe(0);
    expect(
      screen.getByText(
        'Daily AI limit for regular work was reached; it no longer stops this workspace'
      )
    ).toBeInTheDocument();
    // FE audit pass 13, MED F13-1: "for new mail" + the not-re-run sentence, as the BE effect says
    // (without its UTC-only time, which the footer gives) — never the bare "run again." that read
    // as if the mail sorted during the stop now gets drafts.
    expect(
      screen.getByText(
        'AI drafts, auto-replies and widget answers run again for new mail. Mail the local model sorted while the limit was reached is not re-run now; it may be analysed again with AI after the reset, best effort.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/run again for new mail/)).toBeInTheDocument();
    expect(screen.getByText(/is not re-run now/)).toBeInTheDocument();
    expect(screen.queryByText('AI drafts, auto-replies and widget answers run again.')).toBeNull();
    expect(screen.queryByText(/^Since a limit setting changed/)).toBeNull();
    expect(
      screen.getByText(
        /^A limit setting changed; checked at 12:05 UTC on 2026-09-30 \(\d\d:\d\d your time\); this notice is only a record\.$/
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/knowledge-base/i)).toBeNull();
    expect(screen.queryByText(/stop until the reset/)).toBeNull();
    expect(screen.queryByText(/Only your platform administrator/)).toBeNull();
    expect(screen.queryByText(/^Resets at/)).toBeNull();
    expect(document.querySelector('svg.text-muted-foreground')).not.toBeNull();
  });

  // be-toklim-wt 0d61a3e0 `regularLimitReleasedEffect` (tokenBudgetAlerts.ts:873): `notifyOnce`'s
  // own strict re-check marks the row 'no_longer_enforced' without knowing WHY (a move to its own
  // key, or an own-key enforcement switch whose save missed the row), and since BE R15 so does a
  // save whose previous settings did not stop the workspace or could not be read — so the footer
  // claims no cause either way, only when it was checked (FE audit pass 15, LOW; pass 16, NIT).
  it("released by the gate's own re-check (no_longer_enforced): the footer claims no cause", async () => {
    rows = [
      regular({
        releasedAt: '2026-09-30T12:05:00.000Z',
        checkedAt: '2026-09-30T12:05:00.000Z',
        effect:
          'The regular-work limit no longer stops this workspace (checked at 12:05 UTC): AI drafts, auto-replies and widget answers run again for new mail. ' +
          "Mail the local model sorted while the limit was reached is not re-run now: after the reset, open conversations handled this way may be analysed again with AI — best effort, using at most half of the next day's regular limit; any not re-analysed that day, or refused because the limit is reached again, keep the local model's result.",
        partial: false,
        releaseKind: 'regular',
        releaseCause: 'no_longer_enforced',
      }),
    ];
    const hook = await show();
    expect(hook.alerts[0].releaseCause).toBe('no_longer_enforced');
    expect(hook.badged).toBe(0);
    expect(
      screen.getByText(
        /^Checked at 12:05 UTC on 2026-09-30 \(\d\d:\d\d your time\); this notice is only a record\.$/
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/A limit setting changed/)).toBeNull();
    expect(screen.queryByText(/no limit setting changed/i)).toBeNull();
    // The title already says it; the footer does not repeat it (FE audit pass 14, NIT).
    expect(screen.queryAllByText(/no longer stops this workspace/i)).toHaveLength(1);
    expect(screen.getByText(/run again for new mail/)).toBeInTheDocument();
  });

  // be-toklim-wt 44f0f921 `markKbLimitNoticeReleased` (BE R16 A): KB rows released by a save
  // now carry `releaseCause` too; 'no_longer_enforced' when the settings the save replaced did not
  // pause the workspace (or could not be read). The footer claims no cause for a KB row either.
  it('a KB row released as no_longer_enforced: "Checked at", no limit-setting cause', async () => {
    rows = [
      row(8, '2099-10-01T00:00:00.000Z', {
        releasedAt: '2026-09-30T12:05:00.000Z',
        checkedAt: '2026-09-30T12:05:00.000Z',
        effect:
          'The KB limit no longer pauses this workspace (checked at 12:05 UTC): any paused knowledge-base mining was queued to continue. Knowledge-base consolidation makes proposals again from its next nightly run.',
        partial: false,
        releaseKind: 'mining',
        releaseCause: 'no_longer_enforced',
      }),
    ];
    const hook = await show();
    expect(hook.alerts[0].bucket).toBe('kb');
    expect(hook.alerts[0].releaseCause).toBe('no_longer_enforced');
    expect(screen.getByText(/^Checked at 12:05 UTC on 2026-09-30 /)).toBeInTheDocument();
    expect(screen.queryByText(/A limit setting changed/)).toBeNull();
  });

  it('CONTROL: a KB row released by a limit setting still says the setting changed', async () => {
    rows = [
      row(8, '2099-10-01T00:00:00.000Z', {
        releasedAt: '2026-09-30T12:05:00.000Z',
        checkedAt: '2026-09-30T12:05:00.000Z',
        partial: false,
        releaseKind: 'mining',
        releaseCause: 'limit_setting',
      }),
    ];
    await show();
    expect(
      screen.getByText(/^A limit setting changed; checked at 12:05 UTC on 2026-09-30 /)
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Checked at/)).toBeNull();
  });

  it.each([
    ['absent (a row from before BE round 13)', {}],
    ['not a known value', { releaseCause: 'something_else' }],
  ])('CONTROL: releaseCause %s reads as a limit setting change', async (_label, over) => {
    rows = [
      regular({
        releasedAt: '2026-09-30T12:05:00.000Z',
        checkedAt: '2026-09-30T12:05:00.000Z',
        partial: false,
        releaseKind: 'regular',
        ...over,
      }),
    ];
    const hook = await show();
    expect(hook.alerts[0].releaseCause).toBe('limit_setting');
    expect(
      screen.getByText(/^A limit setting changed; checked at 12:05 UTC on 2026-09-30 /)
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Checked at/)).toBeNull();
  });

  it('CONTROL: not released (also every regular row from a BE before round 12) stays a current stop', async () => {
    rows = [regular()];
    const hook = await show();
    expect(hook.badged).toBe(1);
    expect(screen.getByText('Daily AI limit for regular work reached')).toBeInTheDocument();
    expect(screen.getByText(/widget answers stop until the reset/)).toBeInTheDocument();
    expect(screen.getByText(/Only your platform administrator/)).toBeInTheDocument();
    expect(screen.getByText(/^Resets at 00:00 UTC/)).toBeInTheDocument();
    expect(screen.queryByText(/run again/)).toBeNull();
    expect(document.querySelector('svg.text-destructive')).not.toBeNull();
  });

  it('CONTROL: a released KB notice keeps its mining words and "pauses"', async () => {
    rows = [
      row(8, '2099-10-01T00:00:00.000Z', {
        releasedAt: '2026-09-30T12:05:00.000Z',
        checkedAt: '2026-09-30T12:05:00.000Z',
        partial: false,
        releaseKind: 'notice_only',
      }),
    ];
    await show();
    expect(
      screen.getByText(
        'Daily AI limit for KB processing was reached; it no longer pauses this workspace'
      )
    ).toBeInTheDocument();
    // Exact: the KB-released words are unchanged by the regular wording (FE pass 13 control).
    expect(
      screen.getByText(
        'No paused knowledge-base mining was waiting here. Knowledge-base consolidation makes proposals again from its next nightly run.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/run again/)).toBeNull();
    expect(screen.queryByText(/not re-run now/)).toBeNull();
    // This KB row carries no releaseCause (KB rows carry one since BE R16): absent reads as a limit
    // setting, so the footer says so.
    expect(
      screen.getByText(/^A limit setting changed; checked at 12:05 UTC on 2026-09-30 /)
    ).toBeInTheDocument();
  });

  it('a released notice of a bucket this FE does not know: generic words, never KB or regular ones (pass 13, NIT)', async () => {
    rows = [
      row(9, '2099-10-01T00:00:00.000Z', {
        bucket: 'other',
        effect: undefined,
        releasedAt: '2026-09-30T12:05:00.000Z',
        checkedAt: '2026-09-30T12:05:00.000Z',
        partial: false,
        releaseKind: 'notice_only',
      }),
    ];
    await show();
    expect(
      screen.getByText('A limit setting changed, and this limit no longer stops this workspace.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/knowledge-base/i)).toBeNull();
    expect(screen.queryByText(/run again/)).toBeNull();
  });

  // BE R18 (be-toklim-wt 2e42cf55): a released notice carries `details.checkedAt`, the time its own
  // "(checked at HH:MM UTC)" names; `releasedAt` is taken after the promotes, so later. The footer
  // names the check, and never says the setting "changed at" it (BE R18 LOW-1).
  // The effect exactly as markKbLimitNoticeReleased words it for each cause, a whole 'mining'
  // release (be-toklim-wt 919a59c8 tokenBudgetAlerts.ts kbLimitReleasedEffect; pass 20, NIT).
  const r18Kb = (cause: string, checkedAt: unknown) =>
    row(8, '2099-10-01T00:00:00.000Z', {
      effect: `${
        cause === 'limit_setting'
          ? 'Since a limit setting changed, the KB limit no longer pauses this workspace'
          : 'The KB limit no longer pauses this workspace'
      } (checked at 12:04 UTC): any paused knowledge-base mining was queued to continue. Knowledge-base consolidation makes proposals again from its next nightly run.`,
      releasedAt: '2026-09-30T12:05:00.000Z',
      checkedAt,
      partial: false,
      releaseKind: 'mining',
      releaseCause: cause,
    });

  it('R18: a limit-setting release names its check time, not the release write', async () => {
    rows = [r18Kb('limit_setting', '2026-09-30T12:04:30.000Z')];
    const { alerts } = await show();
    expect(alerts[0].checkedAt).toBe('2026-09-30T12:04:30.000Z');
    expect(
      screen.getByText(
        /^A limit setting changed; checked at 12:04 UTC on 2026-09-30 \(\d\d:\d\d your time\); this notice is only a record\.$/
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/changed at/)).toBeNull();
  });

  it('R18: a no-longer-enforced release names its check time too', async () => {
    rows = [r18Kb('no_longer_enforced', '2026-09-30T12:04:30.000Z')];
    await show();
    expect(
      screen.getByText(/^Checked at 12:04 UTC on 2026-09-30 \(\d\d:\d\d your time\);/)
    ).toBeInTheDocument();
  });

  // The REGULAR bucket's R18 row (markRegularLimitNoticeReleased + regularLimitReleasedEffect).
  it('R18: a released REGULAR notice names its check time, not the release write', async () => {
    rows = [
      {
        id: 9,
        kind: 'ai_token_limit_reached',
        details: {
          title: 'Daily AI limit for regular work reached',
          bucket: 'regular',
          spent: 2_000_100,
          limit: 2_000_000,
          enforced: true,
          resetsAt: '2099-10-01T00:00:00.000Z',
          effect:
            'Since a limit setting changed, the regular-work limit no longer stops this workspace (checked at 12:04 UTC): AI drafts, auto-replies and widget answers run again for new mail. ' +
            "Mail the local model sorted while the limit was reached is not re-run now: after the reset, open conversations handled this way may be analysed again with AI — best effort, using at most half of the next day's regular limit; any not re-analysed that day, or refused because the limit is reached again, keep the local model's result.",
          releasedAt: '2026-09-30T12:05:00.000Z',
          checkedAt: '2026-09-30T12:04:30.000Z',
          partial: false,
          releaseKind: 'regular',
          releaseCause: 'limit_setting',
        },
      },
    ];
    const { alerts } = await show();
    expect(alerts[0].checkedAt).toBe('2026-09-30T12:04:30.000Z');
    expect(
      screen.getByText(
        /^A limit setting changed; checked at 12:04 UTC on 2026-09-30 \(\d\d:\d\d your time\); this notice is only a record\.$/
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/changed at/)).toBeNull();
  });
});
