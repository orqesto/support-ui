import { create } from 'zustand';

/**
 * Which mail sources' processing panels are open, and why. Problem panels are NOT here: they are
 * derived from the source's own view (a problem the person has not closed), so they survive a
 * reload without being remembered as "open".
 *
 * - `run`: a recorded run (by its id, from the database) big enough to show opened it; it closes
 *   itself once THAT run owes nothing.
 * - `manual`: the person opened it (the header indicator, or starting a re-mine); only they close
 *   it.
 *
 * Runs are identified by the backend's run id, never by the socket session: the socket merges KB
 * jobs into a mail session, adds KB totals up across jobs, restamps itself within one run and
 * stays in memory for the page's life, so every rule built on it reopened, popped or hid panels
 * (FE audit passes 2–4).
 */
export type PanelReason = 'run' | 'manual';

export type OpenPanel = { reason: PanelReason; runId?: string };

/** Closed runs remembered per source: the backend keeps 20 runs, a few more is plenty. */
const CLOSED_RUNS_KEPT = 25;

/**
 * Closed runs are kept per browser and workspace: in memory only, a reload reopened a panel the
 * person had closed on a run still owing work, on every page load (FE audit pass 6, H1).
 */
const CLOSED_RUNS_PREFIX = 'processingPanel_closedRuns_';
const readClosedRuns = (organizationId: number): Record<number, string[]> => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(`${CLOSED_RUNS_PREFIX}${organizationId}`) ?? '{}'
    );
    if (!parsed || typeof parsed !== 'object') return {};
    // Only string lists: anything else (a hand edit) would turn `includes` into a substring test.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
        .map(([source, ids]) => [source, ids.filter((id): id is string => typeof id === 'string')])
    );
  } catch {
    return {};
  }
};
const writeClosedRuns = (organizationId: number | null, closedRuns: Record<number, string[]>) => {
  if (organizationId === null) return;
  try {
    localStorage.setItem(`${CLOSED_RUNS_PREFIX}${organizationId}`, JSON.stringify(closedRuns));
  } catch {
    // Not remembered: a reload may reopen it — noisy, not wrong.
  }
};

type ProcessingPanelState = {
  opened: Record<number, OpenPanel>;
  /** Run ids the person closed a panel on (or that closed themselves): never reopened for. */
  closedRuns: Record<number, string[]>;
  /** The workspace these panels belong to. */
  organizationId: number | null;
  open: (sourceId: number, reason: PanelReason, runId?: string) => void;
  close: (sourceId: number, runId?: string | null) => void;
  /**
   * Another workspace's panels are not this one's: cleared on an actual SWITCH only. Clearing on
   * every mount dropped panels the person had opened whenever the layout remounted.
   */
  enterWorkspace: (organizationId: number) => void;
  reset: () => void;
};

/** Closed-problem memory is per browser (localStorage), so it goes with the user who closed. */
const CLOSED_PROBLEMS_PREFIX = 'processingPanel_closedProblems_';

export const useProcessingPanelStore = create<ProcessingPanelState>((set) => ({
  opened: {},
  closedRuns: {},
  organizationId: null,
  open: (sourceId, reason, runId) =>
    set((state) => {
      const current = state.opened[sourceId];
      // A panel the person asked for is never downgraded to one that closes itself.
      if (current?.reason === 'manual') return state;
      if (current?.reason === reason && current.runId === runId) return state;
      return { opened: { ...state.opened, [sourceId]: { reason, runId } } };
    }),
  close: (sourceId, runId) =>
    set((state) => {
      const { [sourceId]: _closed, ...opened } = state.opened;
      // Merged with what another tab stored since, for EVERY source — each tab writing its own
      // lists over the shared key dropped the other's closes (FE audit passes 7–8) — and kept in
      // this tab's state too, so it honours them without a reload.
      const stored = state.organizationId === null ? {} : readClosedRuns(state.organizationId);
      const merged: Record<number, string[]> = {};
      for (const key of new Set([...Object.keys(stored), ...Object.keys(state.closedRuns)])) {
        const source = Number(key);
        merged[source] = [
          ...new Set([...(stored[source] ?? []), ...(state.closedRuns[source] ?? [])]),
        ].slice(-CLOSED_RUNS_KEPT);
      }
      if (runId && !(merged[sourceId] ?? []).includes(runId)) {
        merged[sourceId] = [...(merged[sourceId] ?? []), runId].slice(-CLOSED_RUNS_KEPT);
      }
      writeClosedRuns(state.organizationId, merged);
      return { opened, closedRuns: merged };
    }),
  enterWorkspace: (organizationId) =>
    set((state) =>
      state.organizationId === organizationId
        ? state
        : { organizationId, opened: {}, closedRuns: readClosedRuns(organizationId) }
    ),
  reset: () => set({ opened: {}, closedRuns: {}, organizationId: null }),
}));

/**
 * Sign-out: another user may sign in on this tab. Their panels, the runs they closed and the
 * problems they closed are not the next user's (FE audit pass 5, L2).
 */
export const logoutClearsProcessingPanels = (): void => {
  useProcessingPanelStore.getState().reset();
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CLOSED_PROBLEMS_PREFIX) || key.startsWith(CLOSED_RUNS_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage blocked: nothing was remembered either.
  }
};
