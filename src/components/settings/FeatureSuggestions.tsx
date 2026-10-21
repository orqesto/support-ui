import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronRight, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useDepartments } from '@/hooks/useDepartments';
import { useSuggestionDomainAccess } from '@/hooks/useSuggestionDomainAccess';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { whyCannotAct } from '@/lib/learningSuggestionPermissions';
import { logger } from '@/lib/logger';
import {
  isRoutingProposal,
  learningService,
  type LearningDomain,
  type LearningSuggestion,
} from '@/services/learning.service';
import { useAuthStore } from '@/stores/authStore';
import { SuggestionMeta } from './KbReviewSuggestionDetail';
import {
  ConflictDetail,
  SeverityBadge,
  readRefinement,
  summarizeSuggestion,
} from './LearningSuggestionParts';
import { ReplyStyleSuggestionDetail } from './ReplyStyleSuggestionDetail';
import { RoutingProposalCard } from './RoutingProposalCard';

/**
 * The engine's pending suggestions for ONE feature, decided inside that feature's page (owner rule
 * 2026-10-21: a suggestion is decided only where it belongs; Learning activity only shows it).
 * Renders nothing when the feature has none, so an idle page looks exactly as it did before.
 */
export const FeatureSuggestions = ({
  domains,
  types,
  excludeTypes,
  title,
  description,
}: {
  domains: string[];
  /** Only these suggestion types (default: every type in the domains). */
  types?: string[];
  /** Never these types — e.g. Routing Rules leaves `propose_rule` to its dormant rule row. */
  excludeTypes?: string[];
  title: string;
  description?: string;
}) => {
  const { canActOnSuggestion } = useSuggestionDomainAccess();
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const { data: departments = [] } = useDepartments();
  const deptNameById = useCallback(
    (id: number) => departments.find((dept) => dept.id === id)?.name,
    [departments]
  );
  const [rows, setRows] = useState<LearningSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const domainKey = domains.join(',');
  const typeKey = (types ?? []).join(',');
  const excludeKey = (excludeTypes ?? []).join(',');

  const load = useCallback(async () => {
    try {
      const lists = await Promise.all(
        domainKey.split(',').map((domain) => learningService.listSuggestions(domain as LearningDomain))
      );
      const allowed = typeKey ? new Set(typeKey.split(',')) : null;
      const blocked = new Set(excludeKey ? excludeKey.split(',') : []);
      setRows(
        lists
          .flat()
          .filter(
            (row) =>
              row.status === 'pending' &&
              (!allowed || allowed.has(row.suggestionType)) &&
              !blocked.has(row.suggestionType)
          )
      );
    } catch (err) {
      // A missing panel must never break the page it sits on.
      logger.error('Failed to load feature suggestions:', err);
      setRows([]);
    }
  }, [domainKey, typeKey, excludeKey]);

  useEffect(() => {
    setRows([]);
    void load();
  }, [load, selectedOrganizationId]);

  const drop = (id: number) => setRows((prev) => prev.filter((row) => row.id !== id));

  const decide = async (id: number, action: () => Promise<unknown>, failure: string) => {
    setActingId(id);
    try {
      await action();
      drop(id);
    } catch (err) {
      logger.error(failure, err);
      setError(getApiErrorMessage(err) ?? `${failure}. Please try again.`);
    } finally {
      setActingId(null);
    }
  };

  const sorted = useMemo(() => [...rows].sort((left, right) => left.id - right.id), [rows]);
  if (sorted.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3" aria-label={title}>
      <div>
        <h3 className="font-display flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="w-4 h-4" />
          {title} ({sorted.length})
        </h3>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {error && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md text-sm bg-destructive-muted text-destructive border border-destructive-line">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <div className="space-y-2">
        {sorted.map((suggestion) => {
          const canAct = canActOnSuggestion(suggestion);
          const isActing = actingId === suggestion.id;
          if (isRoutingProposal(suggestion)) {
            return (
              <div key={suggestion.id} data-suggestion-id={suggestion.id} className="rounded-lg border border-border bg-background">
                {!canAct && <p className="px-3 pt-3 text-xs text-muted-foreground">{whyCannotAct(suggestion)}</p>}
                <RoutingProposalCard
                  suggestion={suggestion}
                  deptNameById={deptNameById}
                  canAct={canAct}
                  onDone={drop}
                  onError={setError}
                  onStale={() => void load()}
                />
              </div>
            );
          }
          // The house style is prose: the diff IS the decision, so it is always open.
          const open = suggestion.domain === 'reply_style' || expandedId === suggestion.id;
          const refinement = readRefinement(suggestion);
          const confidence = suggestion.confidence ? Math.round(Number(suggestion.confidence) * 100) : null;
          return (
            <div key={suggestion.id} data-suggestion-id={suggestion.id} className="rounded-lg border border-border bg-background">
              <div className="flex justify-between gap-3 items-start p-3">
                <div className="flex-1 min-w-0">
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex items-start justify-start gap-1 p-0 h-auto text-left w-full min-w-0 group hover:bg-transparent"
                    onClick={() => setExpandedId((prev) => (prev === suggestion.id ? null : suggestion.id))}
                  >
                    {open ? (
                      <ChevronDown className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <p className="min-w-0 break-words text-sm font-medium group-hover:underline">
                      <span className="mr-1.5 inline-flex align-middle">
                        <SeverityBadge suggestion={suggestion} />
                      </span>
                      {summarizeSuggestion(suggestion, deptNameById)}
                    </p>
                  </Button>
                  <div className="flex flex-wrap gap-3 mt-1 ml-5 text-xs text-muted-foreground">
                    <SuggestionMeta suggestion={suggestion} confidence={confidence} />
                  </div>
                </div>
                <div className="flex gap-1 items-center shrink-0">
                  {!canAct && <span className="text-xs text-muted-foreground mr-1">{whyCannotAct(suggestion)}</span>}
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Decline"
                    title={canAct ? 'Decline' : whyCannotAct(suggestion)}
                    disabled={isActing || !canAct}
                    onClick={() =>
                      void decide(suggestion.id, () => learningService.declineSuggestion(suggestion.id), 'Failed to decline the suggestion')
                    }
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    aria-label="Accept this suggestion"
                    title={
                      !canAct
                        ? whyCannotAct(suggestion)
                        : suggestion.suggestionType === 'promote'
                          ? 'Accept — makes this rule permanent'
                          : suggestion.domain === 'reply_style'
                            ? 'Accept — makes this the house style for AI-drafted replies'
                            : 'Accept'
                    }
                    disabled={isActing || !canAct}
                    onClick={() =>
                      void decide(suggestion.id, () => learningService.acceptSuggestion(suggestion.id), 'Failed to accept the suggestion')
                    }
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {open &&
                (suggestion.domain === 'reply_style' ? (
                  <ReplyStyleSuggestionDetail suggestion={suggestion} />
                ) : (
                  <ConflictDetail suggestion={suggestion} deptNameById={deptNameById} />
                ))}
              {open && refinement && (
                <div className="px-3 pb-3 ml-5">
                  <div className="rounded-md border border-border bg-success/5 p-2.5 space-y-1.5 text-xs">
                    <div className="font-medium text-foreground">Refine — tighten the over-reaching rule, keep both live</div>
                    {refinement.rationale && <p className="text-muted-foreground">{refinement.rationale}</p>}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground">Rule #{refinement.targetRuleId}:</span>
                      <code className="px-1 py-0.5 rounded bg-destructive/10 text-destructive line-through break-all">{refinement.oldValue}</code>
                      <span className="text-muted-foreground">→</span>
                      <code className="px-1 py-0.5 rounded bg-success/10 text-success break-all">{refinement.proposedValue}</code>
                    </div>
                    <Button
                      size="sm"
                      disabled={isActing || !canAct}
                      onClick={() =>
                        void decide(
                          suggestion.id,
                          () => learningService.editRule(suggestion.id, refinement.target, refinement.proposedValue),
                          'Failed to refine the rule'
                        )
                      }
                    >
                      Refine rule #{refinement.targetRuleId}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
