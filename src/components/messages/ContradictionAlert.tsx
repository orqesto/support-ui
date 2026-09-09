import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import type { ContradictionCheckMetadata, ContradictionCheckResult, ContradictionItem } from '@/types/ai';
import { Alert, AlertDescription, AlertTitle } from '../ui/Alert';

type ContradictionAlertProps = {
  contradictionCheck: ContradictionCheckMetadata;
  organizationId?: number;
};

const confidenceColor = {
  high: 'danger',
  medium: 'warning',
  low: 'secondary',
} as const;

/**
 * Normalize a check result to a list of items, transparently upgrading legacy
 * single-pair records (no `contradictions` array) into a one-item list.
 */
const toContradictionItems = (result: ContradictionCheckResult): ContradictionItem[] => {
  if (result.contradictions?.length) {
    return result.contradictions;
  }
  if (result.hasContradiction) {
    return [
      {
        originalStatement: result.originalStatement,
        currentStatement: result.currentStatement,
        confidence: result.confidence,
        explanation: result.explanation,
        contradictingMessageId: result.contradictingMessageId,
        contradictingMessageDate: result.contradictingMessageDate,
      },
    ];
  }
  return [];
};

/**
 * The two checks the Conflict tab renders — `intraMessageContradictionCheck` and
 * `contradictionCheck` — are frequently THE SAME RESULT, and the tab used to draw it twice.
 *
 * Both writers (`aiAnalysisProcessor`, `contradictionCheckController`) pick the headline result
 * as `threadResult` if it fired, else `intraResult`, and then ALSO store `intraResult` under its
 * own key. So whenever the intra-message check is the one that fired — the thread check found
 * nothing, or there is no thread — both keys hold the same check, and the agent saw an identical
 * "2 conflicts found" panel two times over.
 *
 * ⛔ The duplicate is NOT fixable by storing less. `autoReplyService` and
 * `suggestedAnswerController` read `intraMessageContradictionCheck` and nothing else to decide
 * whether to tell the model a contradiction was found in this message; dropping that key in the
 * case where the intra check fired would silently disable it exactly when it matters. The
 * storage is right and the DISPLAY was wrong, which is also why this fix reaches threads whose
 * metadata was written months ago.
 *
 * Sameness is judged on what the card actually shows — the rendered items plus the occurrence
 * that produced them. The stored objects are NOT reliably byte-equal: the manual path wraps the
 * selected result to add a normalised `contradictions[]` while the intra key keeps the raw shape,
 * so two records that render identically can differ as JSON. `checkedAt`/`triggeredBy` are part
 * of the fingerprint deliberately: two runs at different times that found the same thing are two
 * observations, and collapsing those would hide information rather than a duplicate.
 */
export const contradictionFingerprint = (check: ContradictionCheckMetadata): string =>
  JSON.stringify([
    check.checkedAt,
    check.triggeredBy,
    toContradictionItems(check.result).map((item) => [
      item.currentStatement,
      item.originalStatement,
      item.explanation,
      item.confidence,
      item.contradictingMessageId,
    ]),
  ]);

/**
 * The alerts to render, in display order, with an exact duplicate collapsed to one.
 *
 * Only checks that would actually draw something are returned — `ContradictionAlert` renders
 * null for an empty item list, so a check with no items is not an alert.
 */
export const contradictionChecksToRender = (
  intraCheck?: ContradictionCheckMetadata,
  crossCheck?: ContradictionCheckMetadata
): ContradictionCheckMetadata[] => {
  const drawn = [intraCheck, crossCheck].filter(
    (check): check is ContradictionCheckMetadata =>
      !!check && toContradictionItems(check.result).length > 0
  );

  const seen = new Set<string>();
  return drawn.filter((check) => {
    const key = contradictionFingerprint(check);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const ContradictionRow = ({ item }: { item: ContradictionItem }) => (
  <div className="space-y-3 rounded border border-border/60 bg-background/50 p-3">
    <div className="flex justify-end">
      <Badge variant={confidenceColor[item.confidence]}>{item.confidence} confidence</Badge>
    </div>

    {/* Current statement */}
    {item.currentStatement && (
      <div>
        <p className="font-semibold text-sm">Current claim:</p>
        <p className="text-sm italic text-muted-foreground">"{item.currentStatement}"</p>
      </div>
    )}

    {/* Original statement */}
    {item.originalStatement && (
      <div>
        <p className="font-semibold text-sm">Original statement:</p>
        <p className="text-sm italic text-muted-foreground">"{item.originalStatement}"</p>
      </div>
    )}

    {/* Link to contradicting message */}
    {item.contradictingMessageId && (
      <div>
        <p className="font-semibold text-sm">Source:</p>
        <div className="flex gap-2 items-center">
          <Link
            to={`/messages/${item.contradictingMessageId}`}
            className="text-sm text-primary hover:underline"
          >
            Message #{item.contradictingMessageId}
          </Link>
          {item.contradictingMessageDate && (
            <span className="text-xs text-muted-foreground">
              ({new Date(item.contradictingMessageDate).toLocaleDateString()})
            </span>
          )}
        </div>
      </div>
    )}

    {/* AI explanation */}
    {item.explanation && (
      <div>
        <p className="font-semibold text-sm">Analysis:</p>
        <p className="text-sm text-muted-foreground">{item.explanation}</p>
      </div>
    )}
  </div>
);

export const ContradictionAlert = ({ contradictionCheck }: ContradictionAlertProps) => {
  const { result } = contradictionCheck;

  const items = toContradictionItems(result);
  if (items.length === 0) {
    return null;
  }

  const heading =
    items.length === 1 ? 'Contradiction Detected' : `${items.length} conflicts found`;

  return (
    <Alert variant="warning" className="mb-4">
      <AlertTriangle className="w-4 h-4" />
      <AlertTitle className="flex gap-2 items-center">
        <span>{heading}</span>
        {items.length === 1 && (
          <Badge variant={confidenceColor[items[0].confidence]}>
            {items[0].confidence} confidence
          </Badge>
        )}
      </AlertTitle>
      <AlertDescription>
        <div className="space-y-3 mt-3">
          {items.map((item, index) => (
            <ContradictionRow key={item.contradictingMessageId ?? index} item={item} />
          ))}

          {/* Metadata */}
          <div className="pt-2 text-xs border-t text-muted-foreground">
            Detected{' '}
            {contradictionCheck.triggeredBy === 'auto_pattern' ? 'automatically' : 'manually'} at{' '}
            {new Date(contradictionCheck.checkedAt).toLocaleString()}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
};
