import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { learningService, type DomainEvidence, type LearningEvidence } from '@/services/learning.service';

/**
 * "Is it learning yet?" — on screen instead of in a database session.
 *
 * Each learning domain here has at some point looked registered and healthy while
 * producing nothing, and finding that out took SQL every time. This shows what each
 * one is actually receiving.
 *
 * It reports INPUT, not health, and the copy has to keep saying so: a domain with no
 * evidence is not necessarily broken, and one with plenty is not necessarily working.
 * What it makes possible is telling those two apart.
 */

const DOMAIN_TITLES: Record<string, string> = {
  reply_style: 'Reply Style',
  kb_quality: 'KB Quality',
  routing: 'Routing',
};

const EvidenceRow = ({ evidence }: { evidence: DomainEvidence }) => (
  <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/40 py-3 last:border-b-0">
    <span className="min-w-32 text-sm font-medium text-foreground">
      {DOMAIN_TITLES[evidence.domain] ?? evidence.domain}
    </span>
    <span className="text-sm text-foreground">
      <span className="font-semibold tabular-nums">{evidence.count.toLocaleString()}</span>{' '}
      <span className="text-muted-foreground">{evidence.unit}</span>
    </span>
    {evidence.threshold && (
      <Badge variant={evidence.threshold.met ? 'success' : 'secondary'} size="sm">
        {evidence.threshold.describe}
      </Badge>
    )}
    {/* The last signal matters as much as the count: rules with no recent input is a
        different situation from input arriving and nothing happening. */}
    {evidence.lastAt && (
      <span className="text-xs text-muted-foreground">
        last {new Date(evidence.lastAt).toLocaleDateString()}
      </span>
    )}
    {evidence.note && (
      <span className="w-full text-xs text-muted-foreground">{evidence.note}</span>
    )}
  </li>
);

export const LearningEvidenceCard = () => {
  const [evidence, setEvidence] = useState<LearningEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await learningService.getEvidence();
        if (!cancelled) setEvidence(data);
      } catch (err) {
        logger.error('Failed to load learning evidence:', err);
        // getApiErrorMessage returns undefined for a 5xx, deliberately: a server
        // stack trace is not something to render. Fall back to our own sentence.
        if (!cancelled) setError(getApiErrorMessage(err) ?? 'Could not load learning activity.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // `null` with no error is a backend that does not have the route yet (the service
  // turns that 404 into null). Render nothing rather than an error: a frontend ahead
  // of its backend is a deploy-order fact, not a fault in this workspace.
  if (!loading && !error && evidence === null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-muted-foreground" />
          Learning activity
          {evidence && (
            <span className="ml-auto text-sm font-normal text-muted-foreground">
              last {evidence.windowDays} days
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Spinner />
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <>
            <ul>
              {evidence?.domains.map((domain) => (
                <EvidenceRow key={domain.domain} evidence={domain} />
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              These are the signals reaching each learner, not a health check. Nothing arriving and
              plenty arriving with nothing happening are different problems.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
