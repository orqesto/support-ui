import { useEffect, useState } from 'react';
import { consolidationSwitchText, qualitySwitchText } from '@/components/kb/kbSwitchText';
import { logger } from '@/lib/logger';
import { kbConsolidationService } from '@/services/kbConsolidation.service';
import { getEngineSummary } from '@/services/kbEngine.service';
import type { KbEngineSummary } from '@/services/kbEngine.types';

export type KbEngineSummaryState = {
  /** null while loading or after a failure. */
  summary: KbEngineSummary | null;
  /** The summary request answered (with data or an error): the page may choose its view. */
  settled: boolean;
  /**
   * Why the engine does not score entries at night, from the feature flags the run state reports
   * (`kb.consolidation_enabled`, `kb.quality_review_enabled`, a trial run); null when it does or
   * when the backend did not say.
   */
  nightlyOff: string | null;
};

/**
 * The KB engine at a glance for the page: the stored summary (open questions, the week, kill
 * switches) and whether nightly scoring can run at all. Reviewers only: both endpoints need
 * Manage-KB rights, so nobody else asks.
 */
export const useKbEngineSummary = (
  canReview: boolean,
  departmentId: number | undefined
): KbEngineSummaryState => {
  const [state, setState] = useState<KbEngineSummaryState>({
    summary: null,
    settled: false,
    nightlyOff: null,
  });

  useEffect(() => {
    if (!canReview) return;
    let live = true;
    setState((prev) => ({ ...prev, settled: false }));
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
          qualitySwitchText(switches) ??
          (switches?.dryRun?.on ? consolidationSwitchText(switches) : null);
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

  return state;
};
