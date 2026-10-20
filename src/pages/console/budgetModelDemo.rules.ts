/**
 * Budget model DEMO (proposal, 2026-10): the pure rules behind the "Budget model (demo)" section on
 * the platform AI Spend page. Static example numbers, no backend, nothing is saved — this module
 * must never import a service. Every function returns a new state and leaves its input untouched,
 * so the component can hold the whole simulation in one `useState`.
 *
 * The rules being demonstrated:
 * - one monthly budget (the pool); live mail (all regular work) takes what it needs from it and
 *   stops only when the WHOLE budget is used;
 * - bulk processing (the knowledge base: imports, re-mines, quality, consolidation; "KB" below)
 *   has an optional limit, "may use at most X % of the budget", counted on bulk spend ONLY;
 *   reaching it pauses bulk work, never live mail. Switched off, bulk work shares the whole budget;
 * - a workspace's own limit caps its bulk work only, also counted on its bulk spend;
 * - extra for bulk work is outside the budget, is consumed only while the KB is paused, and unused
 *   extra expires. It is given to one workspace, or to the whole organisation (any workspace's
 *   paused import uses it, after its own extra);
 * - what is spent stays spent: a removed workspace's spend still counts, settings change only what
 *   is left.
 */

import {
  EXTRA_MAX,
  EXTRA_MIN,
  PRICE_PER_MILLION,
  fmt,
  usd,
} from '@/components/budget/budget.rules';

export { EXTRA_MAX, EXTRA_MIN, PRICE_PER_MILLION, fmt, usd };

/** Days an extra lasts, by the "Today / 3 days / 7 days" choice. */
export const EXTRA_END_DAYS = [0, 3, 7] as const;
export const EXTRA_END_LABELS = ['Today', '3 days', '7 days'] as const;
export type ExtraEnd = 0 | 1 | 2;

/**
 * The KB limit range, % of the budget: at least half (room for imports), at most 90% (live mail
 * always keeps at least a tenth of the budget). The same range in both views.
 */
export const KB_MIN_PCT = 50;
export const KB_MAX_PCT = 90;
/** The month the demo plays in: October 2026 (31 days). */
export const LAST_DAY = 31;

export type Tone = 'ok' | 'warn' | 'bad';
export type StatusLine = { tone: Tone; text: string };

const endsText = (days: number): string => (days ? `in ${days} d` : 'today');
export const grantEndsText = (end: ExtraEnd): string =>
  EXTRA_END_DAYS[end] ? `in ${EXTRA_END_DAYS[end]} days` : 'today';

// ---------------------------------------------------------------------------------------------
// Organisation (many workspaces)
// ---------------------------------------------------------------------------------------------

export type DemoWorkspace = {
  id: string;
  name: string;
  /** Spent this month inside the budget (knowledge base + live mail), million tokens. */
  used: number;
  /** The knowledge-base part of `used`. */
  kbUsed: number;
  /**
   * Its own monthly limit for the KNOWLEDGE BASE, or null = shares the whole budget. Measured
   * against everything it used; reaching it stops only its KB, never its live mail.
   */
  limit: number | null;
  /** Extra granted for the KB (outside the budget), its used part and the days it has left. */
  extra: number;
  extraUsed: number;
  extraDays: number;
  importing: boolean;
  importLeft: number;
};

export type OrgDemoState = {
  workspaces: DemoWorkspace[];
  day: number;
  /** Monthly budget, million tokens. */
  budget: number;
  /** Bulk processing may use at most this % of the budget, counted on bulk spend only. */
  kbPct: number;
  /** The bulk limit is on; off = bulk work shares the whole budget with live mail. */
  kbLimitOn: boolean;
  /** Extra for bulk work given to the whole organisation, its used part and the days it has left. */
  orgExtra: number;
  orgExtraUsed: number;
  orgExtraDays: number;
  /** Spent this month by workspaces that were removed: it still counts. */
  spentRemoved: number;
  /** The knowledge-base part of `spentRemoved`. */
  spentRemovedKb: number;
  newCount: number;
  log: string;
};

export type OrgTotals = {
  budget: number;
  kbPct: number;
  kbLimitOn: boolean;
  /** The bulk limit, million tokens; the whole budget while the limit is off. */
  kbCap: number;
  /** Everything used this month: knowledge base + live mail. */
  total: number;
  /** The knowledge-base part of `total`. */
  kbTotal: number;
  kbPaused: boolean;
  allStopped: boolean;
  /** Organisation-wide extra still unused. */
  orgExtraLeft: number;
};

const EXAMPLE_NAMES = [
  'Northwind Shop',
  'Atlas Labs',
  'Zenith Motors',
  'Cedar Clinic',
  'Delta Logistics',
  'Vista Realty',
  'Orbit Fitness',
  'Bluefin Travel',
  'Sable Fashion',
  'Harbor Supply',
  'Ember Games',
  'Pine Studio',
  'Quarry Tools',
  'Yardley Books',
  'River Dental',
  'Maple Bakery',
  'Granite Legal',
  'Willow Pets',
  'Glade Garden',
  'Tundra Outdoor',
  'Copper Coffee',
  'Upland Farms',
  'Fjord Water',
  'Sandbox',
];
const EXAMPLE_USED = [
  106, 28, 19.6, 17.1, 17.3, 14.3, 10.7, 7.5, 7.5, 6.3, 5.9, 5.2, 3.6, 4.0, 3.6, 2.6, 2.5, 2.0, 2.3,
  1.7, 1.3, 0.7, 0.5, 0.1,
];

const blankWorkspace = (id: string, name: string, used: number): DemoWorkspace => ({
  id,
  name,
  used,
  // The example's knowledge base made about three quarters of each workspace's use.
  kbUsed: used * 0.75,
  limit: null,
  extra: 0,
  extraUsed: 0,
  extraDays: 0,
  importing: false,
  importLeft: 0,
});

export const initialOrgState = (): OrgDemoState => {
  const workspaces = EXAMPLE_NAMES.map((name, index) =>
    blankWorkspace(`w${index}`, name, EXAMPLE_USED[index])
  );
  // A big import running on extra, one workspace with its own limit, one more import.
  Object.assign(workspaces[0], {
    extra: 40,
    extraUsed: 0,
    extraDays: 3,
    importing: true,
    importLeft: 60,
  });
  workspaces[1].limit = 30;
  Object.assign(workspaces[4], { importing: true, importLeft: 25 });
  return {
    workspaces,
    day: 19,
    budget: 400,
    kbPct: 60,
    kbLimitOn: true,
    orgExtra: 0,
    orgExtraUsed: 0,
    orgExtraDays: 0,
    spentRemoved: 0,
    spentRemovedKb: 0,
    newCount: 0,
    log: '',
  };
};

/** The KB limit, clamped to 50–90% of the budget — the same range in both views. */
export const clampKbPct = (pct: number): number => Math.min(KB_MAX_PCT, Math.max(KB_MIN_PCT, pct));

export const orgTotals = (
  state: Pick<
    OrgDemoState,
    | 'workspaces'
    | 'budget'
    | 'kbPct'
    | 'kbLimitOn'
    | 'orgExtra'
    | 'orgExtraUsed'
    | 'spentRemoved'
    | 'spentRemovedKb'
  >
): OrgTotals => {
  const budget = Math.max(1, state.budget || 1);
  const kbCap = state.kbLimitOn ? (budget * state.kbPct) / 100 : budget;
  const total = state.workspaces.reduce((sum, ws) => sum + ws.used, 0) + state.spentRemoved;
  const kbTotal = state.workspaces.reduce((sum, ws) => sum + ws.kbUsed, 0) + state.spentRemovedKb;
  return {
    budget,
    kbPct: state.kbPct,
    kbLimitOn: state.kbLimitOn,
    kbCap,
    total,
    kbTotal,
    kbPaused: state.kbLimitOn && kbTotal >= kbCap,
    allStopped: total >= budget,
    orgExtraLeft: state.orgExtra - state.orgExtraUsed,
  };
};

export const workspaceStatus = (ws: DemoWorkspace, tot: OrgTotals): StatusLine => {
  const limitHit = ws.limit !== null && ws.kbUsed >= ws.limit;
  const ownLeft = ws.extra - ws.extraUsed;
  // A paused import uses its own extra first, then the organisation's.
  const extraLeft = ownLeft + tot.orgExtraLeft;
  if (tot.allStopped && !(ws.importing && extraLeft > 0))
    return { tone: 'bad', text: 'Stopped: monthly budget used up' };
  if (limitHit)
    return {
      tone: 'warn',
      text: `KB stopped: reached its own limit (${fmt(ws.limit ?? 0)}) · live mail continues`,
    };
  if (ws.importing && extraLeft > 0 && (tot.kbPaused || tot.allStopped))
    return {
      tone: 'warn',
      text:
        ownLeft > 0
          ? `KB import on extra · ${fmt(ownLeft)} left · ends ${endsText(ws.extraDays)}`
          : `KB import on organisation extra · ${fmt(tot.orgExtraLeft)} left`,
    };
  if (ws.importing && tot.kbPaused)
    return { tone: 'warn', text: 'KB import paused · live mail continues' };
  if (ownLeft > 0)
    return {
      tone: 'ok',
      text: `KB import running · extra ready (${fmt(ownLeft)}, ends ${endsText(ws.extraDays)})`,
    };
  if (ws.limit !== null && ws.kbUsed >= ws.limit * 0.8)
    return {
      tone: 'warn',
      text: `KB near its own limit (${fmt(ws.kbUsed)} of ${fmt(ws.limit)})`,
    };
  if (ws.importing) return { tone: 'ok', text: `KB import running · ${fmt(ws.importLeft)} to go` };
  return { tone: 'ok', text: 'OK' };
};

export const orgStatusLine = (tot: OrgTotals): StatusLine => {
  if (tot.allStopped)
    return {
      tone: 'bad',
      text: 'Monthly budget used up: live mail stops too. Raise the budget, or AI resumes on 1 Nov. Bulk work with extra continues.',
    };
  if (tot.kbPaused)
    return {
      tone: 'warn',
      text: `Bulk processing paused: it used its ${fmt(tot.kbCap)}. Live mail continues and can use the last ${fmt(tot.budget - tot.total)}. Workspaces with extra keep importing.`,
    };
  if (!tot.kbLimitOn)
    return {
      tone: 'warn',
      text: `No bulk limit: bulk work shares the whole budget, so a big import can stop live mail. ${fmt(tot.budget - tot.total)} left.`,
    };
  return {
    tone: 'ok',
    text: `All running. Bulk processing can use ${fmt(Math.min(tot.kbCap - tot.kbTotal, tot.budget - tot.total))} more. Live mail can use ${fmt(tot.budget - tot.total)}.`,
  };
};

/** Suggested extra: what the import still needs (or half its use), rounded to 5M, at least 5M. */
export const suggestedExtra = (ws: DemoWorkspace): number =>
  Math.max(EXTRA_MIN, Math.round((ws.importLeft || ws.used * 0.5) / 5) * 5);

/** The limit slider's resting position while the workspace has no own limit. */
export const defaultLimitFor = (ws: DemoWorkspace, budget: number): number =>
  Math.min(Math.round(budget), Math.ceil(ws.used * 1.5) + 5);

/** Workspaces by use, biggest first. */
export const sortByUse = (workspaces: DemoWorkspace[]): DemoWorkspace[] =>
  workspaces.slice().sort((left, right) => right.used - left.used);

const cloneWorkspaces = (workspaces: DemoWorkspace[]) => workspaces.map((ws) => ({ ...ws }));

/**
 * One simulated day. Per workspace (biggest first): live mail ~1.2% of its use (≥0.05M) unless the
 * whole budget is used (a workspace limit never stops live mail); an import moves up to 12M, inside
 * the budget only until the KB limit, the budget and the workspace's own limit, then on its extra; an extra with
 * no days left expires.
 */
export const simulateOrgDay = (state: OrgDemoState): OrgDemoState => {
  if (state.day >= LAST_DAY)
    return {
      ...state,
      log: 'Last day of the month. On 1 Nov the budget starts again and extras end.',
    };
  const next: OrgDemoState = {
    ...state,
    day: state.day + 1,
    workspaces: cloneWorkspaces(state.workspaces),
  };
  const before = orgTotals(state);
  const notes: string[] = [];
  for (const ws of sortByUse(next.workspaces)) {
    let tot = orgTotals(next);
    const limitHit = () => ws.limit !== null && ws.kbUsed >= ws.limit;
    // live mail
    const live = Math.max(0.05, ws.used * 0.012);
    // A workspace limit caps its knowledge base only: live mail stops only on the whole budget.
    if (!tot.allStopped) ws.used += Math.min(live, tot.budget - tot.total);
    // KB import
    if (ws.importing && ws.importLeft > 0) {
      tot = orgTotals(next);
      let todo = Math.min(12, ws.importLeft);
      if (!tot.kbPaused && !limitHit()) {
        const room = Math.min(
          tot.kbCap - tot.kbTotal,
          tot.budget - tot.total,
          ws.limit !== null ? ws.limit - ws.kbUsed : todo
        );
        const done = Math.max(0, Math.min(todo, room));
        ws.used += done;
        ws.kbUsed += done;
        ws.importLeft -= done;
        todo -= done;
      }
      const extraLeft = ws.extra - ws.extraUsed;
      if (todo > 0 && extraLeft > 0) {
        const done = Math.min(todo, extraLeft);
        ws.extraUsed += done;
        ws.importLeft -= done;
        todo -= done;
      }
      // Then the organisation's extra.
      const orgLeft = next.orgExtra - next.orgExtraUsed;
      if (todo > 0 && orgLeft > 0) {
        const done = Math.min(todo, orgLeft);
        next.orgExtraUsed += done;
        ws.importLeft -= done;
      }
      if (ws.importLeft <= 0) {
        ws.importing = false;
        notes.push(`${ws.name} finished its import`);
      }
    }
    if (ws.extra > 0) {
      if (ws.extraDays <= 0) {
        notes.push(`${ws.name}'s extra ended (${fmt(ws.extra - ws.extraUsed)} unused, expired)`);
        ws.extra = 0;
        ws.extraUsed = 0;
      } else ws.extraDays--;
    }
  }
  if (next.orgExtra > 0) {
    if (next.orgExtraDays <= 0) {
      notes.push(
        `the organisation extra ended (${fmt(next.orgExtra - next.orgExtraUsed)} unused, expired)`
      );
      next.orgExtra = 0;
      next.orgExtraUsed = 0;
    } else next.orgExtraDays--;
  }
  const after = orgTotals(next);
  if (!before.kbPaused && after.kbPaused)
    notes.push(
      'bulk processing used its limit: KB imports without extra paused, live mail continues'
    );
  if (!before.allStopped && after.allStopped) notes.push('the monthly budget is used up');
  next.log = `${next.day} Oct: ` + (notes.length ? notes.join('; ') + '.' : 'normal day.');
  return next;
};

const updateWorkspace = (
  state: OrgDemoState,
  id: string,
  change: (ws: DemoWorkspace) => Partial<DemoWorkspace>
): OrgDemoState => ({
  ...state,
  workspaces: state.workspaces.map((ws) => (ws.id === id ? { ...ws, ...change(ws) } : ws)),
});

export const setWorkspaceLimit = (state: OrgDemoState, id: string, limit: number | null) =>
  updateWorkspace(state, id, () => ({ limit }));

/** Give extra for the KB; a workspace not importing starts an import the size of the extra. */
export const grantOrgExtra = (state: OrgDemoState, id: string, amount: number, end: ExtraEnd) =>
  updateWorkspace(state, id, (ws) => ({
    extra: amount,
    extraUsed: 0,
    extraDays: EXTRA_END_DAYS[end],
    ...(ws.importing ? {} : { importing: true, importLeft: Math.max(ws.importLeft, amount) }),
  }));

/** Give extra for bulk work to the whole organisation: any workspace's paused import uses it. */
export const grantOrgWideExtra = (
  state: OrgDemoState,
  amount: number,
  end: ExtraEnd
): OrgDemoState => ({
  ...state,
  orgExtra: amount,
  orgExtraUsed: 0,
  orgExtraDays: EXTRA_END_DAYS[end],
});

export const endOrgWideExtra = (state: OrgDemoState): OrgDemoState => ({
  ...state,
  orgExtra: 0,
  orgExtraUsed: 0,
});

/** Organisation-wide extra suggestion: what the running imports still need, rounded to 5M. */
export const suggestedOrgExtra = (state: OrgDemoState): number =>
  Math.max(
    EXTRA_MIN,
    Math.round(
      state.workspaces.reduce((sum, ws) => sum + (ws.importing ? ws.importLeft : 0), 0) / 5
    ) * 5
  );

export const endOrgExtra = (state: OrgDemoState, id: string) =>
  updateWorkspace(state, id, () => ({ extra: 0, extraUsed: 0 }));

// ---------------------------------------------------------------------------------------------
// Bulk actions on selected workspaces
// ---------------------------------------------------------------------------------------------

const plural = (count: number) => (count === 1 ? '1 workspace' : `${count} workspaces`);

/** Set (or, with null, remove) the same own bulk limit on every selected workspace. */
export const setLimitMany = (
  state: OrgDemoState,
  ids: readonly string[],
  limit: number | null
): OrgDemoState => {
  const picked = new Set(ids);
  const count = state.workspaces.filter((ws) => picked.has(ws.id)).length;
  return {
    ...state,
    workspaces: state.workspaces.map((ws) => (picked.has(ws.id) ? { ...ws, limit } : ws)),
    log:
      limit === null
        ? `Own limit removed from ${plural(count)}.`
        : `${plural(count)}: bulk limit ${fmt(limit)} each.`,
  };
};

/**
 * Give extra to every selected workspace: the same amount, or (null) each its suggested amount.
 * Unlike the single grant it never starts an import: unused extra simply expires.
 */
export const grantExtraMany = (
  state: OrgDemoState,
  ids: readonly string[],
  amount: number | null,
  end: ExtraEnd
): OrgDemoState => {
  const picked = new Set(ids);
  let given = 0;
  let count = 0;
  const workspaces = state.workspaces.map((ws) => {
    if (!picked.has(ws.id)) return ws;
    const extra = amount ?? suggestedExtra(ws);
    given += extra;
    count++;
    return { ...ws, extra, extraUsed: 0, extraDays: EXTRA_END_DAYS[end] };
  });
  return {
    ...state,
    workspaces,
    log: `${plural(count)}: extra given, ${fmt(given)} in all, ends ${grantEndsText(end)}.`,
  };
};

/** End the extra on every selected workspace that has one; unused tokens are dropped. */
export const endExtraMany = (state: OrgDemoState, ids: readonly string[]): OrgDemoState => {
  const picked = new Set(ids);
  let count = 0;
  let unused = 0;
  const workspaces = state.workspaces.map((ws) => {
    if (!picked.has(ws.id) || ws.extra <= 0) return ws;
    count++;
    unused += ws.extra - ws.extraUsed;
    return { ...ws, extra: 0, extraUsed: 0, extraDays: 0 };
  });
  return {
    ...state,
    workspaces,
    log: `Extra ended for ${plural(count)} (${fmt(unused)} unused).`,
  };
};

/** A new workspace joins with no own limit and starts a 30M import. Returns the state and its id. */
export const addWorkspace = (state: OrgDemoState): { state: OrgDemoState; id: string } => {
  const count = state.newCount + 1;
  const ws: DemoWorkspace = {
    ...blankWorkspace(`n${count}`, `New workspace ${count}`, 0),
    importing: true,
    importLeft: 30,
  };
  return {
    id: ws.id,
    state: {
      ...state,
      newCount: count,
      workspaces: [...state.workspaces, ws],
      log: `${ws.name} joined with no own limit: it shares the organisation budget and starts a 30M import.`,
    },
  };
};

/** Remove a workspace: its spend this month still counts; its limit and extra end. */
export const removeWorkspace = (state: OrgDemoState, id: string): OrgDemoState => {
  const ws = state.workspaces.find((other) => other.id === id);
  if (!ws) return state;
  return {
    ...state,
    spentRemoved: state.spentRemoved + ws.used,
    spentRemovedKb: state.spentRemovedKb + ws.kbUsed,
    workspaces: state.workspaces.filter((other) => other.id !== id),
    log: `${ws.name} removed. Its ${fmt(ws.used)} spent this month still counts; its limit and extra end.`,
  };
};

// ---------------------------------------------------------------------------------------------
// Single workspace (not in an organisation: its own budget)
// ---------------------------------------------------------------------------------------------

export type SingleDemoState = {
  day: number;
  budget: number;
  /** Bulk processing may use at most this % of the budget, counted on bulk spend only. */
  kbPct: number;
  /** The bulk limit is on; off = bulk work shares the whole budget with live mail. */
  kbLimitOn: boolean;
  kbUsed: number;
  liveUsed: number;
  importing: boolean;
  importLeft: number;
  extra: number;
  extraUsed: number;
  extraDays: number;
  log: string;
};

export type SingleTotals = {
  budget: number;
  kbPct: number;
  kbLimitOn: boolean;
  /** The bulk limit, million tokens; the whole budget while the limit is off. */
  kbCap: number;
  used: number;
  kbPaused: boolean;
  stopped: boolean;
};

export const SINGLE_WORKSPACE_NAME = 'Lakeside Dental';
/** Live mail per simulated day, million tokens. */
export const SINGLE_LIVE_PER_DAY = 0.6;
/** Import progress per simulated day, million tokens. */
export const SINGLE_IMPORT_PER_DAY = 10;

export const initialSingleState = (): SingleDemoState => ({
  day: 19,
  budget: 60,
  kbPct: 80,
  kbLimitOn: true,
  kbUsed: 28,
  liveUsed: 9,
  importing: false,
  importLeft: 0,
  extra: 0,
  extraUsed: 0,
  extraDays: 0,
  log: '',
});

export const singleTotals = (st: SingleDemoState): SingleTotals => {
  const budget = Math.max(1, st.budget || 1);
  const kbCap = st.kbLimitOn ? (budget * st.kbPct) / 100 : budget;
  const used = st.kbUsed + st.liveUsed;
  return {
    budget,
    kbPct: st.kbPct,
    kbLimitOn: st.kbLimitOn,
    kbCap,
    used,
    kbPaused: st.kbLimitOn && st.kbUsed >= kbCap,
    stopped: used >= budget,
  };
};

export const singleStatusLine = (st: SingleDemoState): StatusLine => {
  const tot = singleTotals(st);
  const extraLeft = st.extra - st.extraUsed;
  if (tot.stopped)
    return {
      tone: 'bad',
      text:
        'Monthly budget used up: live mail stops too. Raise the budget, or AI resumes on 1 Nov.' +
        (extraLeft > 0 && st.importing ? ' The KB import continues on its extra.' : ''),
    };
  if (tot.kbPaused && st.importing && extraLeft > 0)
    return {
      tone: 'warn',
      text: `Bulk processing used its ${fmt(tot.kbCap)}; the import continues on its extra (${fmt(extraLeft)} left). Live mail continues.`,
    };
  if (tot.kbPaused)
    return {
      tone: 'warn',
      text: `Bulk processing paused: it used its ${fmt(tot.kbCap)}. Live mail continues and can use the last ${fmt(tot.budget - tot.used)}. Give extra to continue an import.`,
    };
  if (!tot.kbLimitOn)
    return {
      tone: 'warn',
      text:
        `No bulk limit: bulk work shares the whole budget, so a big import can stop live mail. ${fmt(tot.budget - tot.used)} left.` +
        (st.importing ? ` KB import: ${fmt(st.importLeft)} to go.` : ''),
    };
  return {
    tone: 'ok',
    text:
      `All running. Bulk processing can use ${fmt(Math.min(tot.kbCap - st.kbUsed, tot.budget - tot.used))} more. Live mail can use ${fmt(tot.budget - tot.used)}.` +
      (st.importing ? ` KB import: ${fmt(st.importLeft)} to go.` : ''),
  };
};

export const singleMonthLine = (st: SingleDemoState): string => {
  const tot = singleTotals(st);
  return `Used ${fmt(tot.used)} of ${fmt(tot.budget)} (${usd(tot.used)}). Live mail averages ${fmt(st.liveUsed / st.day)} a day.`;
};

export const simulateSingleDay = (state: SingleDemoState): SingleDemoState => {
  if (state.day >= LAST_DAY)
    return {
      ...state,
      log: 'Last day of the month. On 1 Nov the budget starts again and extras end.',
    };
  const st: SingleDemoState = { ...state, day: state.day + 1 };
  const notes: string[] = [];
  let tot = singleTotals(st);
  if (!tot.stopped) st.liveUsed += Math.min(SINGLE_LIVE_PER_DAY, tot.budget - tot.used);
  tot = singleTotals(st);
  if (st.importing && st.importLeft > 0) {
    let todo = Math.min(SINGLE_IMPORT_PER_DAY, st.importLeft);
    if (!tot.kbPaused) {
      const done = Math.min(todo, tot.kbCap - st.kbUsed, tot.budget - tot.used);
      st.kbUsed += done;
      st.importLeft -= done;
      todo -= done;
    }
    const extraLeft = st.extra - st.extraUsed;
    if (todo > 0 && extraLeft > 0) {
      const done = Math.min(todo, extraLeft);
      st.extraUsed += done;
      st.importLeft -= done;
    }
    if (st.importLeft <= 0) {
      st.importing = false;
      notes.push('the KB import finished');
    }
  }
  if (st.extra > 0) {
    if (st.extraDays <= 0) {
      notes.push(`the extra ended (${fmt(st.extra - st.extraUsed)} unused, expired)`);
      st.extra = 0;
      st.extraUsed = 0;
    } else st.extraDays--;
  }
  const after = singleTotals(st);
  if (!tot.kbPaused && after.kbPaused)
    notes.push('bulk processing used its limit and paused; live mail continues');
  st.log = `${st.day} Oct: ` + (notes.length ? notes.join('; ') + '.' : 'normal day.');
  return st;
};

export const startSingleImport = (st: SingleDemoState, amount = 30): SingleDemoState => ({
  ...st,
  importing: true,
  importLeft: st.importLeft + amount,
  log: `A ${amount}M KB import started.`,
});

export const grantSingleExtra = (
  st: SingleDemoState,
  amount: number,
  end: ExtraEnd
): SingleDemoState => ({
  ...st,
  extra: amount,
  extraUsed: 0,
  extraDays: EXTRA_END_DAYS[end],
});

export const endSingleExtra = (st: SingleDemoState): SingleDemoState => ({
  ...st,
  extra: 0,
  extraUsed: 0,
});

/** "ends in 3 d" / "ends today" for a running extra. */
export const extraEndsText = (days: number): string => `ends ${endsText(days)}`;
