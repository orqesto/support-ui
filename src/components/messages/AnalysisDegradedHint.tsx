import { ANALYSIS_DEGRADED_HINT } from './aiFlagCopy';

/**
 * "AI couldn't analyse" — shown where the analysis is, when the backend marks the triage AI's
 * answer as a fallback (`metadata.analysis.analysisDegraded`, 2026-10-21). Such messages no longer
 * get `needsMoreInfo`, so without this the facets would read as a clean analysis. Renders nothing
 * on an older backend (field absent).
 */
export const AnalysisDegradedHint = ({ degraded }: { degraded?: boolean }) =>
  degraded === true ? (
    <p
      className="text-[11px] leading-snug text-warning"
      data-testid="analysis-degraded"
      role="note"
    >
      {ANALYSIS_DEGRADED_HINT}
    </p>
  ) : null;

/** The "Info" facet's value: "Not judged" when degraded, else needs-more / complete, else none. */
export const analysisInfoValue = (analysis?: {
  needsMoreInfo?: boolean;
  analysisDegraded?: boolean;
}): string | null => {
  if (analysis?.analysisDegraded === true) return 'Not judged';
  if (analysis?.needsMoreInfo === undefined) return null;
  return analysis.needsMoreInfo ? 'Needs more' : 'Complete';
};
