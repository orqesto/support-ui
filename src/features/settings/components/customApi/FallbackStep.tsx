import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FallbackWarningLine } from './FallbackWarningLine';
import { VALUE_PLACEHOLDER } from './parameterFields';

/**
 * 2026-11-13: a chained lookup's optional fallback — the path called with the customer's email when
 * the source lookup finds no account, shown on the same card. Generic on purpose: the admin writes
 * the path, and which field is "the record's email" is their own “Customer’s email” tag.
 */
interface Props {
  fallbackPath: string;
  onChange: (fallbackPath: string) => void;
  /** The source lookup's label, or null before one is chosen. */
  sourceLabel: string | null;
  /** Why the backend would refuse it (`fallbackProblems`); each is shown, and blocks Test/Save. */
  problems: string[];
  /** The wizard's own Test conditions hold (chain complete, path set, not busy) and no problem. */
  testable: boolean;
  /** The backend's `fallbackWarning` on the stored lookup, or absent. */
  warning?: unknown;
  /**
   * "Test fallback": run the fallback path with this email through the lookup's records path and
   * say what the ownership filter kept. Null ⇒ it failed, and the wizard's error line says why.
   */
  onTest: (email: string) => Promise<string | null>;
}

export const FallbackStep = ({
  fallbackPath,
  onChange,
  sourceLabel,
  problems,
  testable,
  onTest,
  warning,
}: Props) => {
  const [email, setEmail] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  // An answer about another path is not an answer about this one.
  useEffect(() => setOutcome(null), [fallbackPath]);

  const test = async () => {
    setOutcome(null);
    setOutcome(await onTest(email.trim()));
  };

  return (
    <div className="space-y-2">
      <Input
        label="If it finds no account, search by email instead (optional)"
        value={fallbackPath}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`/orders?email=${VALUE_PLACEHOLDER}`}
      />
      <p className="text-xs text-muted-foreground">
        A path on this connection, with {VALUE_PLACEHOLDER} where the customer’s email goes. It is
        used only when {sourceLabel ? `“${sourceLabel}”` : 'that lookup'} finds no account, and its
        results show on this card. We show only results whose “Customer’s email” field is exactly
        the customer’s email; the rest are hidden and counted.
      </p>
      <FallbackWarningLine warning={warning} />
      {problems.map((problem) => (
        <p key={problem} role="alert" className="text-xs text-destructive">
          {problem}
        </p>
      ))}
      {fallbackPath.trim() !== '' && problems.length === 0 && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Input
              label="An email to try the fallback with"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setOutcome(null);
              }}
            />
          </div>
          <Button size="sm" disabled={!testable || !email.trim()} onClick={() => void test()}>
            Test fallback
          </Button>
        </div>
      )}
      {outcome && (
        <p data-testid="fallback-test-outcome" className="text-xs text-muted-foreground">
          {outcome}
        </p>
      )}
    </div>
  );
};
