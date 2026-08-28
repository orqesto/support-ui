import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatisticsMessagesTab } from '@/components/statistics/StatisticsMessagesTab';
import type { MessageStatsData } from '@/services/statistics.service';

/**
 * Two failure modes, both silent.
 *
 * 1. `receiveToResolve` is absent in production until the backend tag lands — the frontend
 *    deploys on push. Reaching into it unguarded white-screens the whole Statistics page, not
 *    just one row.
 * 2. An unconfigured workspace reports `businessHours: null`. Rendering that as `0h` would read
 *    as "answered outside opening hours every single time" and be indistinguishable from a
 *    real, terrible number.
 */
afterEach(cleanup);

const base: MessageStatsData = {
  resolutionTime: { avgHours: 5, p50Hours: 4, p90Hours: 9, totalClosed: 12 },
  firstResponseTime: { avgHours: 2, p50Hours: 1.5, p90Hours: 6, totalResponded: 20 },
  threadSizeDistribution: {},
  categoryTrends: [],
  languageBreakdown: [],
};

const renderTab = (msgStats: MessageStatsData) =>
  render(
    <StatisticsMessagesTab
      msgStats={msgStats}
      msgLoading={false}
      labelStats={[]}
      labelLoading={false}
      msgDays={30}
    />
  );

describe('StatisticsMessagesTab — response metrics', () => {
  it('renders without the new metric when the backend has not shipped it', () => {
    renderTab(base);

    // Control: the page rendered at all — the old cards are present...
    expect(screen.getByText('Avg First Response')).toBeInTheDocument();
    // ...and the new row is simply absent rather than crashing the tab.
    expect(screen.queryByText('Avg Receive → Resolve')).toBeNull();
  });

  it('shows receive-to-resolve once the backend provides it', () => {
    renderTab({
      ...base,
      receiveToResolve: { avgHours: 30, p50Hours: 24, p90Hours: 70, totalResolved: 9 },
    });

    expect(screen.getByText('Avg Receive → Resolve')).toBeInTheDocument();
    expect(screen.getByText('Resolved by a person')).toBeInTheDocument();
  });

  it('shows an open-hours figure beside wall-clock when a calendar exists', () => {
    renderTab({
      ...base,
      firstResponseTime: {
        ...base.firstResponseTime,
        businessHours: { avgHours: 1.2, p50Hours: 1, p90Hours: 3, total: 20 },
      },
    });

    expect(screen.getAllByText(/open hours/).length).toBeGreaterThan(0);
  });

  it('prints no open-hours figure at all when no calendar is configured', () => {
    // null must not become "0h" — that is a claim, not an absence.
    renderTab({
      ...base,
      firstResponseTime: { ...base.firstResponseTime, businessHours: null },
    });

    expect(screen.queryByText(/open hours/)).toBeNull();
  });

  it('says what the human-only figure left out, rather than implying it counted everything', () => {
    renderTab({
      ...base,
      receiveToResolve: {
        avgHours: 30, p50Hours: 24, p90Hours: 70, totalResolved: 9,
        excludedUnknownActor: 41, excludedSystemResolved: 7,
      },
    });

    expect(screen.getByText(/41 resolved before we recorded who did it/)).toBeInTheDocument();
    expect(screen.getByText(/unknown, not automated/)).toBeInTheDocument();
    expect(screen.getByText(/7 resolved by automation are excluded/)).toBeInTheDocument();
  });

  it('discloses a truncated open-hours window instead of presenting it as complete', () => {
    renderTab({
      ...base,
      receiveToResolve: { avgHours: 30, p50Hours: 24, p90Hours: 70, totalResolved: 9 },
      meta: { businessHoursTruncated: true },
    });

    expect(screen.getByText(/first 5,000 conversations/)).toBeInTheDocument();
  });
});

/**
 * The empty panel that was not broken.
 *
 * On prod, framehouse has 2,936 resolved conversations and every one carries a NULL `closed_at`,
 * because ten of the eleven backend paths that resolve a conversation never stamped it. Both
 * duration metrics require that column, so the page showed six em-dashes, two zeros, and a
 * footnote whose every number was ALSO zero — the metric's own exclusion counters are filters
 * inside a query that already requires a close time, so they cannot describe a row that lacks
 * one. Nothing on screen accounted for the missing 2,936, which is why it read as a broken
 * feature rather than an honest gap.
 */
describe('StatisticsMessagesTab — an empty panel says why it is empty', () => {
  it('accounts for resolved conversations that carry no close time', () => {
    renderTab({
      ...base,
      resolutionTime: { avgHours: null, p50Hours: null, p90Hours: null, totalClosed: 0, excludedNoCloseStamp: 2936 },
    });

    // The count is the point: "0 closed" beside a silent 2,936 is the misleading state.
    expect(screen.getByText(/2,936 resolved conversations have/)).toBeInTheDocument();
    expect(screen.getByText(/no recorded close time/)).toBeInTheDocument();
  });

  it('states that nothing qualifies yet, rather than leaving four dashes unexplained', () => {
    renderTab({
      ...base,
      receiveToResolve: {
        avgHours: null, p50Hours: null, p90Hours: null, totalResolved: 0,
        excludedUnknownActor: 0, excludedSystemResolved: 0, excludedNoCloseStamp: 2936,
      },
    });

    expect(screen.getByText(/Nothing in this window qualifies yet/)).toBeInTheDocument();
    // ...and it must not be phrased as a zero, which would be a measurement.
    expect(screen.getByText(/blank rather than zero/)).toBeInTheDocument();
  });

  it('CONTROL: a healthy workspace is not shown an apology for a problem it does not have', () => {
    // Without this, wording that always renders would pass every assertion above.
    renderTab({
      ...base,
      receiveToResolve: { avgHours: 30, p50Hours: 24, p90Hours: 70, totalResolved: 9 },
    });

    expect(screen.queryByText(/no recorded close time/)).toBeNull();
    expect(screen.queryByText(/Nothing in this window qualifies yet/)).toBeNull();
  });

  it('CONTROL: stays silent when the backend predates the field entirely', () => {
    // `excludedNoCloseStamp` is absent until the tag lands. Absent is not zero and not a defect.
    renderTab({
      ...base,
      resolutionTime: { avgHours: null, p50Hours: null, p90Hours: null, totalClosed: 0 },
    });

    expect(screen.queryByText(/no recorded close time/)).toBeNull();
  });
});
