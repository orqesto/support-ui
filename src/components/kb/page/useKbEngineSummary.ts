import { useCallback, useEffect, useState } from 'react';
import { consolidationSwitchText, qualitySwitchText } from '@/components/kb/kbSwitchText';
import { logger } from '@/lib/logger';
import { kbConsolidationService } from '@/services/kbConsolidation.service';
import { getEngineSummary } from '@/services/kbEngine.service';
import type { KbEngineSummary } from '@/services/kbEngine.types';

/**
 * How long a bare `/knowledge-base` waits for the open-question count before it opens Live
 * answers anyway: a slow or hung summary must never leave the page on a spinner.
 */
export const KB_SUMMARY_WAIT_MS = 2000;

export type KbEngineSummaryState = {
  /** null while loading or after a failure. */
  summary: KbEngineSummary | null;
  /**
   * The page may choose its view: the summary answered (with data or an error), or it took
   * longer than `KB_SUMMARY_WAIT_MS`. A summary that arrives later still fills the counts.
   */
  settled: boolean;
  /**
   * The engine does not score entries at night: a feature flag the run state reports keeps it off
   * (`kb.consolidation_enabled`, `kb.quality_review_enabled`, unreadable, or a trial run). False
   * when it runs or when the backend did not say. The flag detail is for admins and stays on the
   * Automatic actions page, never on this one.
   */
  nightlyOff: boolean;
};

export type KbEngineSummaryHook = KbEngineSummaryState & {
  /**
   * A question left the open set on this page (answered, already decided, or gone): the heading,
   * the tab and the digest drop together, with no new request. `olderThan7d` drops too when that
   * question was open over 7 days.
   */
  decrementOpen: (olderThan7d: boolean) => void;
};

/**
 * The KB engine at a glance for the page: the stored summary (open questions, the week, kill
 * switches) and whether nightly scoring can run at all. Reviewers only: both endpoints need
 * Manage-KB rights, so nobody else asks.
 */
export const useKbEngineSummary = (
  canReview: boolean,
  departmentId: number | undefined
): KbEngineSummaryHook => {
  const [state, setState] = useState<KbEngineSummaryState>({
    summary: null,
    settled: false,
    nightlyOff: false,
  });

  useEffect(() => {
    if (!canReview) return;
    let live = true;
    setState((prev) => ({ ...prev, settled: false }));
    const waited = setTimeout(() => {
      if (live) setState((prev) => ({ ...prev, settled: true }));
    }, KB_SUMMARY_WAIT_MS);
    // Through a promise chain: anything that throws reads as "not known", never breaks the page.
    Promise.resolve()
      .then(() => getEngineSummary(departmentId))
      .then((summary) => {
        if (live) setState((prev) => ({ ...prev, summary, settled: true }));
      })
      .catch((error: unknown) => {
        logger.error('Failed to load the KB engine summary:', error);
        if (live) setState((prev) => ({ ...prev, summary: null, settled: true }));
      });
    return () => {
      live = false;
      clearTimeout(waited);
    };
  }, [canReview, departmentId]);

  useEffect(() => {
    if (!canReview) return;
    let live = true;
    Promise.resolve()
      .then(() => kbConsolidationService.getRunState())
      .then((runState) => {
        const switches = runState?.switches;
        // A trial run labels entries only: the quality review does not run either.
        const off =
          qualitySwitchText(switches) !== null ||
          (switches?.dryRun?.on === true && consolidationSwitchText(switches) !== null);
        if (live) setState((prev) => ({ ...prev, nightlyOff: off }));
      })
      .catch((error: unknown) => {
        // Unknown is not "on" and not "off": nothing is claimed.
        logger.error('Failed to read the KB run state:', error);
      });
    return () => {
      live = false;
    };
  }, [canReview]);

  const decrementOpen = useCallback((olderThan7d: boolean) => {
    setState((prev) =>
      prev.summary
        ? {
            ...prev,
            summary: {
              ...prev.summary,
              questions: {
                open: Math.max(0, prev.summary.questions.open - 1),
                olderThan7d: olderThan7d
                  ? Math.max(0, prev.summary.questions.olderThan7d - 1)
                  : prev.summary.questions.olderThan7d,
              },
            },
          }
        : prev
    );
  }, []);

  return { ...state, decrementOpen };
};
