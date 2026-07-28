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
