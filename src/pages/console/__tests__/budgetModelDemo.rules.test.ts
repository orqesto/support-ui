import { describe, expect, it } from 'vitest';
import {
  addWorkspace,
  barParts,
  clampReservePct,
  reserveFromEdge,
  endOrgExtra,
  fmt,
  grantOrgExtra,
  grantSingleExtra,
  initialOrgState,
  initialSingleState,
  orgStatusLine,
  orgTotals,
  removeWorkspace,
  setWorkspaceLimit,
  simulateOrgDay,
  simulateSingleDay,
  singleStatusLine,
  singleTotals,
  startSingleImport,
  suggestedExtra,
  usd,
  workspaceStatus,
  type DemoWorkspace,
  type OrgDemoState,
} from '../budgetModelDemo.rules';

const ws = (over: Partial<DemoWorkspace> = {}): DemoWorkspace => ({
  id: 'x1',
  name: 'Example A',
  used: 10,
  kbUsed: 0,
  limit: null,
  extra: 0,
  extraUsed: 0,
  extraDays: 0,
  importing: false,
  importLeft: 0,
  ...over,
});

const org = (workspaces: DemoWorkspace[], over: Partial<OrgDemoState> = {}): OrgDemoState => ({
  workspaces,
  day: 10,
  budget: 100,
  reservePct: 20,
  spentRemoved: 0,
  spentRemovedKb: 0,
  newCount: 0,
  log: '',
  ...over,
});

const find = (state: OrgDemoState, id: string) => {
  const found = state.workspaces.find((item) => item.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};

describe('formatting', () => {
  it('formats millions and the Haiku 5.5 list-price estimate', () => {
    expect(fmt(106)).toBe('106M');
    expect(fmt(28)).toBe('28.0M');
    // 0.925 × $0.10 + 0.075 × $0.50 = $0.13 per 1M
    expect(usd(400)).toBe('≈ $52');
    expect(usd(1)).toBe('≈ $0.13');
  });
});

describe('KB line floor', () => {
  it('clamps at 50% (same floor in both views) and at 100%', () => {
    expect(clampReservePct(80)).toBe(50);
    expect(clampReservePct(50)).toBe(50);
    expect(clampReservePct(25)).toBe(25);
    expect(clampReservePct(-20)).toBe(0);
    // The slider reports where the striped part starts on the bar.
    expect(reserveFromEdge(20)).toBe(50);
    expect(reserveFromEdge(75)).toBe(25);
    expect(reserveFromEdge(120)).toBe(0);
  });
});

describe('organisation status rules', () => {
  it('all running below the KB line', () => {
    const tot = orgTotals(org([ws({ used: 50 })]));
    expect(tot.kbPaused).toBe(false);
    expect(orgStatusLine(tot)).toEqual({
      tone: 'ok',
      text: 'All running. Knowledge base can use 30.0M more. Live mail can use 50.0M.',
    });
  });

  it('KB paused at the line, live mail continues', () => {
    const tot = orgTotals(org([ws({ used: 85 })]));
    expect(tot.kbPaused).toBe(true);
    expect(tot.allStopped).toBe(false);
    expect(orgStatusLine(tot).tone).toBe('warn');
    expect(orgStatusLine(tot).text).toMatch(
      /^Knowledge base paused: it stops at 80.0M and 85.0M is used\. Live mail can use the last 15.0M\./
    );
  });

  it('whole budget used: live mail stops too', () => {
    const tot = orgTotals(org([ws({ used: 100 })]));
    expect(tot.allStopped).toBe(true);
    expect(orgStatusLine(tot).tone).toBe('bad');
  });

  it('per-workspace statuses', () => {
    const below = orgTotals(org([ws({ used: 10 })]));
    const paused = orgTotals(org([ws({ used: 85 })]));
    const stopped = orgTotals(org([ws({ used: 100 })]));
    expect(workspaceStatus(ws(), below)).toEqual({ tone: 'ok', text: 'OK' });
    expect(workspaceStatus(ws({ importing: true, importLeft: 12 }), below).text).toBe(
      'KB import running · 12.0M to go'
    );
    expect(workspaceStatus(ws({ importing: true, importLeft: 12 }), paused)).toEqual({
      tone: 'warn',
      text: 'KB import paused · live mail continues',
    });
    expect(
      workspaceStatus(ws({ importing: true, importLeft: 12, extra: 20, extraDays: 3 }), paused)
    ).toEqual({ tone: 'warn', text: 'KB import on extra · 20.0M left · ends in 3 d' });
    expect(workspaceStatus(ws(), stopped)).toEqual({
      tone: 'bad',
      text: 'Stopped: monthly budget used up',
    });
    // Extra keeps an import going even when the whole budget is used.
    expect(workspaceStatus(ws({ importing: true, importLeft: 12, extra: 20 }), stopped).tone).toBe(
      'warn'
    );
    expect(workspaceStatus(ws({ used: 9, limit: 10 }), below).text).toBe(
      'Near its own limit (9.0M of 10.0M)'
    );
  });

  it('a reached workspace limit stops its KB only: warn, live mail continues', () => {
    const tot = orgTotals(org([ws({ used: 12 })]));
    expect(workspaceStatus(ws({ used: 12, limit: 10 }), tot)).toEqual({
      tone: 'warn',
      text: 'KB stopped: reached its own limit (10.0M) · live mail continues',
    });
  });
});

describe('budget bar parts', () => {
  it('used, free for both, free for live mail only: never overlapping, always the whole bar', () => {
    // 400 budget, KB stops at 320: 270 used ⇒ 50 free for both, 80 live mail only.
    expect(barParts(400, 270, 320)).toEqual({
      freeBothPct: 12.5,
      liveOnlyPct: 20,
      freeBoth: 50,
      liveOnly: 80,
    });
    // Reserve 45% (KB stops at 220), 270 used: nothing free for both; the last 130 is live mail only.
    expect(barParts(400, 270, 220)).toEqual({
      freeBothPct: 0,
      liveOnlyPct: 32.5,
      freeBoth: 0,
      liveOnly: 130,
    });
    expect(barParts(400, 400, 220).liveOnly).toBe(0);
  });
});

describe('organisation +1 day', () => {
  it('KB import pauses at the line; live mail continues', () => {
    // 78 used, line at 80: the import moves only 2M (minus live mail first), never past the line.
    const start = org([ws({ id: 'big', used: 78, importing: true, importLeft: 50 })]);
    const next = simulateOrgDay(start);
    const tot = orgTotals(next);
    expect(tot.total).toBeCloseTo(80, 6);
    // Only the import counts as knowledge base: 80 − 78 − 0.936 of live mail.
    expect(tot.kbTotal).toBeCloseTo(80 - 78 - 78 * 0.012, 6);
    expect(find(next, 'big').importLeft).toBeGreaterThan(40);
    expect(next.log).toMatch(/only the part kept for live mail is left/);

    const after = simulateOrgDay(next);
    const big = find(after, 'big');
    // Past the line: no KB progress inside the budget, live mail still adds.
    expect(big.importLeft).toBe(find(next, 'big').importLeft);
    expect(orgTotals(after).total).toBeGreaterThan(80);
  });

  it('extra is consumed only while the KB is paused', () => {
    const running = org([
      ws({ id: 'a1', used: 10, importing: true, importLeft: 30, extra: 20, extraDays: 3 }),
    ]);
    const day1 = simulateOrgDay(running);
    expect(find(day1, 'a1').extraUsed).toBe(0);

    const paused = org([
      ws({ id: 'a1', used: 85, importing: true, importLeft: 30, extra: 20, extraDays: 3 }),
    ]);
    const day2 = simulateOrgDay(paused);
    expect(find(day2, 'a1').extraUsed).toBe(12);
    expect(find(day2, 'a1').importLeft).toBe(18);
    // Extra is outside the budget: used grew by live mail only.
    expect(find(day2, 'a1').used).toBeCloseTo(85 + 85 * 0.012, 6);
  });

  it('extra expires: unused tokens are dropped once its days run out', () => {
    const start = org([ws({ id: 'a1', used: 85, extra: 20, extraDays: 1 })]);
    const day1 = simulateOrgDay(start);
    expect(find(day1, 'a1').extraDays).toBe(0);
    expect(find(day1, 'a1').extra).toBe(20);
    const day2 = simulateOrgDay(day1);
    expect(find(day2, 'a1').extra).toBe(0);
    expect(day2.log).toContain("Example A's extra ended (20.0M unused, expired)");
  });

  it('a removed workspace’s spend still counts', () => {
    const start = org([ws({ id: 'a1', used: 40 }), ws({ id: 'b1', name: 'Example B', used: 30 })]);
    const removed = removeWorkspace(start, 'b1');
    expect(removed.workspaces).toHaveLength(1);
    expect(removed.spentRemoved).toBe(30);
    expect(removed.spentRemovedKb).toBe(0);
    expect(orgTotals(removed).total).toBe(orgTotals(start).total);
    expect(removed.log).toBe(
      'Example B removed. Its 30.0M spent this month still counts; its limit and extra end.'
    );
    // And it keeps counting after more days.
    const later = simulateOrgDay(removed);
    expect(orgTotals(later).total).toBeGreaterThan(70);
  });

  it('live mail continues until the full budget, then stops', () => {
    let state = org([ws({ id: 'a1', used: 99.5 })]);
    state = simulateOrgDay(state);
    expect(orgTotals(state).total).toBeCloseTo(100, 6);
    expect(state.log).toMatch(/the monthly budget is used up/);
    const stuck = simulateOrgDay(state);
    expect(orgTotals(stuck).total).toBeCloseTo(100, 6);
  });

  it('a workspace past its own limit keeps live mail, only its KB import stops', () => {
    const start = org([ws({ id: 'a1', used: 20, limit: 15, importing: true, importLeft: 30 })]);
    const next = simulateOrgDay(start);
    const after = find(next, 'a1');
    expect(after.used).toBeCloseTo(20 + 20 * 0.012, 6); // live mail added
    expect(after.importLeft).toBe(30); // KB did not move
  });

  it('a workspace limit caps the import at the limit', () => {
    const start = org([ws({ id: 'a1', used: 10, limit: 14, importing: true, importLeft: 30 })]);
    const after = find(simulateOrgDay(start), 'a1');
    expect(after.used).toBeCloseTo(14, 6);
  });

  it('stops at the last day of the month', () => {
    const last = simulateOrgDay(org([ws()], { day: 31 }));
    expect(last.day).toBe(31);
    expect(last.log).toMatch(/^Last day of the month/);
  });

  it('does not mutate its input', () => {
    const start = initialOrgState();
    const snapshot = JSON.stringify(start);
    simulateOrgDay(start);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});

describe('organisation actions', () => {
  it('grant extra starts an import if none runs; end now drops it', () => {
    const start = org([ws({ id: 'a1', used: 10 })]);
    const granted = grantOrgExtra(start, 'a1', 25, 2);
    expect(find(granted, 'a1')).toMatchObject({
      extra: 25,
      extraUsed: 0,
      extraDays: 7,
      importing: true,
      importLeft: 25,
    });
    expect(find(endOrgExtra(granted, 'a1'), 'a1').extra).toBe(0);
  });

  it('granting extra flips a paused import to "on extra"', () => {
    const start = org([ws({ id: 'a1', used: 85, importing: true, importLeft: 30 })]);
    const tot = orgTotals(start);
    expect(workspaceStatus(find(start, 'a1'), tot).text).toBe(
      'KB import paused · live mail continues'
    );
    const granted = grantOrgExtra(start, 'a1', 30, 0);
    expect(workspaceStatus(find(granted, 'a1'), tot).text).toBe(
      'KB import on extra · 30.0M left · ends today'
    );
  });

  it('add joins with no limit and a 30M import; limits set and clear', () => {
    const { state, id } = addWorkspace(org([]));
    expect(find(state, id)).toMatchObject({ name: 'New workspace 1', limit: null, importLeft: 30 });
    expect(find(setWorkspaceLimit(state, id, 12), id).limit).toBe(12);
    expect(find(setWorkspaceLimit(state, id, null), id).limit).toBeNull();
  });

  it('suggested extra = import left (or half its use), rounded to 5M, at least 5M', () => {
    expect(suggestedExtra(ws({ importLeft: 23 }))).toBe(25);
    expect(suggestedExtra(ws({ used: 40 }))).toBe(20);
    expect(suggestedExtra(ws({ used: 1 }))).toBe(5);
  });

  it('example data: 24 workspaces, 400M budget, 20% kept for live mail', () => {
    const state = initialOrgState();
    expect(state.workspaces).toHaveLength(24);
    expect(orgTotals(state)).toMatchObject({ budget: 400, reserve: 80, kbLine: 320 });
  });
});

describe('single workspace', () => {
  it('starts all running', () => {
    const state = initialSingleState();
    expect(singleTotals(state)).toMatchObject({ budget: 60, reserve: 12, kbLine: 48, used: 37 });
    expect(singleStatusLine(state)).toEqual({
      tone: 'ok',
      text: 'All running. Knowledge base can use 11.0M more. Live mail can use 23.0M.',
    });
  });

  it('a KB import pauses at the KB cap, then continues on extra only', () => {
    let state = startSingleImport(initialSingleState());
    expect(state.log).toBe('A 30M KB import started.');
    state = simulateSingleDay(state); // live 0.6, then KB 10 → 47.6
    state = simulateSingleDay(state); // live mail first: 48.2 ≥ the 48 cap, so the KB pauses
    expect(singleTotals(state).used).toBeCloseTo(48.2, 6);
    expect(singleTotals(state).kbPaused).toBe(true);
    expect(singleStatusLine(state).text).toMatch(
      /^Knowledge base paused: it stops at 48.0M and 48.2M is used\./
    );
    const leftAtPause = state.importLeft;

    state = simulateSingleDay(state);
    expect(state.importLeft).toBe(leftAtPause);
    expect(state.extraUsed).toBe(0);

    state = grantSingleExtra(state, 20, 1);
    expect(singleStatusLine(state).text).toMatch(
      /the import continues on its extra \(20.0M left\)/
    );
    state = simulateSingleDay(state);
    expect(state.extraUsed).toBe(10);
    // Extra is outside the budget: the KB's in-budget spend did not move.
    expect(state.kbUsed).toBeCloseTo(38, 6);
    expect(state.importLeft).toBe(leftAtPause - 10);
  });

  it('live mail continues past the KB cap until the full budget', () => {
    let state = { ...initialSingleState(), liveUsed: 59.7, kbUsed: 0 };
    state = simulateSingleDay(state);
    expect(singleTotals(state).used).toBeCloseTo(60, 6);
    expect(singleStatusLine(state).tone).toBe('bad');
  });

  it('extra expires', () => {
    let state = grantSingleExtra(initialSingleState(), 20, 0);
    state = simulateSingleDay(state);
    expect(state.extra).toBe(0);
    expect(state.log).toContain('the extra ended (20.0M unused, expired)');
  });
});
