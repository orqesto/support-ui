import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import type { ContradictionCheckMetadata } from '@/types/ai';
import { Alert, AlertDescription, AlertTitle } from '../ui/Alert';

type ContradictionAlertProps = {
  contradictionCheck: ContradictionCheckMetadata;
  organizationId?: number;
};

export const ContradictionAlert = ({ contradictionCheck }: ContradictionAlertProps) => {
  const { result } = contradictionCheck;

  if (!result.hasContradiction) {
    return null;
  }

  const confidenceColor = {
    high: 'danger',
    medium: 'warning',
    low: 'secondary',
  } as const;

  return (
    <Alert variant="warning" className="mb-4">
      <AlertTriangle className="w-4 h-4" />
      <AlertTitle className="flex gap-2 items-center">
        <span>Contradiction Detected</span>
        <Badge variant={confidenceColor[result.confidence]}>{result.confidence} confidence</Badge>
      </AlertTitle>
      <AlertDescription>
        <div className="space-y-3 mt-3">
          {/* Current statement */}
          {result.currentStatement && (
            <div>
              <p className="font-semibold text-sm">Current claim:</p>
              <p className="text-sm italic text-muted-foreground">"{result.currentStatement}"</p>
            </div>
          )}

          {/* Original statement */}
          {result.originalStatement && (
            <div>
              <p className="font-semibold text-sm">Original statement:</p>
              <p className="text-sm italic text-muted-foreground">"{result.originalStatement}"</p>
            </div>
          )}

          {/* Link to contradicting message */}
          {result.contradictingMessageId && (
            <div>
              <p className="font-semibold text-sm">Source:</p>
              <div className="flex gap-2 items-center">
                <Link
                  to={`/messages/${result.contradictingMessageId}`}
                  className="text-sm text-primary hover:underline"
                >
                  Message #{result.contradictingMessageId}
                </Link>
                {result.contradictingMessageDate && (
                  <span className="text-xs text-muted-foreground">
                    ({new Date(result.contradictingMessageDate).toLocaleDateString()})
                  </span>
                )}
              </div>
            </div>
          )}

          {/* AI explanation */}
          {result.explanation && (
            <div>
              <p className="font-semibold text-sm">Analysis:</p>
              <p className="text-sm text-muted-foreground">{result.explanation}</p>
            </div>
          )}

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
