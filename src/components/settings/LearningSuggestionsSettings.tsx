import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Check, X, RefreshCw, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useDepartments } from '@/hooks/useDepartments';
import { learningService, type LearningSuggestion } from '@/services/learning.service';
import { logger } from '@/lib/logger';
import { SuggestionMeta } from './KbReviewSuggestionDetail';
import { useAuthStore } from '@/stores/authStore';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { whyCannotAct } from '@/lib/learningSuggestionPermissions';
import { suggestionHome, suggestionHomeName } from '@/lib/suggestionHome';
import { useSuggestionDomainAccess } from '@/hooks/useSuggestionDomainAccess';
import {
  DOMAIN_LABELS,
  SeverityBadge,
  summarizeSuggestion,
  ConflictDetail,
} from './LearningSuggestionParts';

/**
 * Settings › AI › Learning activity. It SHOWS what the engine found: a suggestion that belongs to a
 * feature is decided there ("Decide in <feature>"); only one with no feature page yet is decided
 * here, under "Not yet in a feature page" (owner rule 2026-10-21).
 */

export const LearningSuggestionsSettings = () => {
  const { canActOn, canActOnSuggestion, canActOnAnyDomain } = useSuggestionDomainAccess();
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const [suggestions, setSuggestions] = useState<LearningSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: departments = [] } = useDepartments();
  const deptNameById = useCallback(
    (id: number) => departments.find((dept) => dept.id === id)?.name,
    [departments]
  );

  // `quiet`: re-read after a decision without blanking the list behind a spinner.
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const rows = await learningService.listSuggestions();
      setSuggestions(rows);
    } catch (err) {
      logger.error('Failed to load learning suggestions:', err);
      setError(getApiErrorMessage(err) ?? 'Failed to load suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch when the active organization changes. The api-client attaches the
  // current org as X-Organization-Context on every request, but this panel fetches
  // imperatively — without keying the effect on selectedOrganizationId it would keep
  // showing whichever org was active at mount (cross-org stale data). Clear first so
  // the previous org's rows don't flash while the refetch is in flight.
  useEffect(() => {
    setSuggestions([]);
    void load();
  }, [load, selectedOrganizationId]);

  // Deep link from the bell (NotificationCenter.goToAiSettings → ?focus=<id>): open that suggestion
  // and scroll to it, once per focus id (a later reload must not yank the page back to it).
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const focusId = Number(searchParams.get('focus'));
  const focusedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!Number.isInteger(focusId) || focusId <= 0 || focusedRef.current === focusId) return;
    if (!suggestions.some((row) => row.id === focusId)) return;
    focusedRef.current = focusId;
    setExpandedId(focusId);
    document.querySelector(`[data-suggestion-id="${focusId}"]`)?.scrollIntoView({ block: 'center' });
  }, [focusId, suggestions]);

  const handleAccept = async (id: number) => {
    setActingId(id);
    try {
      await learningService.acceptSuggestion(id);
      setSuggestions((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      logger.error('Failed to accept suggestion:', err);
      setError(getApiErrorMessage(err) ?? 'Failed to accept the suggestion. Please try again.');
    } finally {
      setActingId(null);
    }
  };

  const handleDecline = async (id: number) => {
    setActingId(id);
    try {
      await learningService.declineSuggestion(id);
      setSuggestions((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      logger.error('Failed to decline suggestion:', err);
      setError(getApiErrorMessage(err) ?? 'Failed to decline the suggestion. Please try again.');
    } finally {
      setActingId(null);
    }
  };

  // Rows with a home are only shown (and linked); the rest stay decidable here.
  const { homed, unhomed } = useMemo(() => {
    const group = (list: LearningSuggestion[]) => {
      const map = new Map<string, LearningSuggestion[]>();
      for (const row of list) {
        const bucket = map.get(row.domain) ?? [];
        bucket.push(row);
        map.set(row.domain, bucket);
      }
      return Array.from(map.entries());
    };
    return {
      homed: group(suggestions.filter((row) => suggestionHome(row) !== null)),
      unhomed: group(suggestions.filter((row) => suggestionHome(row) === null)),
    };
  }, [suggestions]);

  // Visible to anyone who can act on at least one domain. Hiding the whole panel from moderators
  // was the old behaviour and the bug: they hold manage_routing_rules, so the engine was proposing
  // changes to rules they maintain, on a screen they could not open. Per suggestion, the actions
  // below are disabled with a reason when this viewer may not act on THAT domain.
  if (!canActOnAnyDomain) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex gap-2 items-center">
            <Sparkles className="w-5 h-5" />
            Suggestions found
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          What the learning engine found and changed. Each suggestion is decided where it applies —
          follow its link to the feature page.
        </p>

        {error && (
          <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md text-sm bg-destructive-muted text-destructive border border-destructive-line">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading suggestions…</p>
        ) : suggestions.length === 0 ? (
          <div className="py-8 text-center">
            <Sparkles className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {canActOn('routing')
                ? 'No proposals yet — they appear after people in your workspace route similar mail a few times.'
                : 'No suggestions yet — they appear as people in your workspace work through mail.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {homed.map(([domain, rows]) => (
              <div key={domain}>
                <h4 className="font-display mb-2 text-xs font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                  {DOMAIN_LABELS[domain] ?? domain} ({rows.length})
                </h4>
                <div className="space-y-2">
                  {rows.map((suggestion) => {
                    const home = suggestionHome(suggestion);
                    const confidence = suggestion.confidence ? Math.round(Number(suggestion.confidence) * 100) : null;
                    return (
                      <div
                        key={suggestion.id}
                        data-suggestion-id={suggestion.id}
                        className="flex justify-between gap-3 items-start p-3 rounded-lg border border-border bg-background"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="min-w-0 break-words text-sm font-medium">
                            <span className="mr-1.5 inline-flex align-middle"><SeverityBadge suggestion={suggestion} /></span>
                            {summarizeSuggestion(suggestion, deptNameById)}
                          </p>
                          <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                            <SuggestionMeta suggestion={suggestion} confidence={confidence} />
                          </div>
                        </div>
                        {home && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            aria-label={`Decide in ${suggestionHomeName(home)}: suggestion ${suggestion.id}`}
                            title={home.label}
                            onClick={() => navigate(home.href)}
                          >
                            Decide in {suggestionHomeName(home)}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {unhomed.length > 0 && (
              <div>
                <h4 className="font-display mb-1 text-xs font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                  Not yet in a feature page
                </h4>
                <p className="mb-2 text-xs text-muted-foreground">
                  These have no feature page of their own yet, so you can decide them here.
                </p>
                <div className="space-y-4">
                  {unhomed.map(([domain, rows]) => (
                    <div key={domain} className="space-y-2">
                      <h5 className="text-xs font-medium text-muted-foreground">
                        {DOMAIN_LABELS[domain] ?? domain} ({rows.length})
                      </h5>
                      {rows.map((suggestion) => {
                        const confidence = suggestion.confidence ? Math.round(Number(suggestion.confidence) * 100) : null;
                        const isActing = actingId === suggestion.id;
                        const canAct = canActOnSuggestion(suggestion);
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
                                  {expandedId === suggestion.id ? (
                                    <ChevronDown className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                  )}
                                  <p className="min-w-0 break-words text-sm font-medium group-hover:underline">
                                    {summarizeSuggestion(suggestion, deptNameById)}
                                  </p>
                                </Button>
                                <div className="flex flex-wrap gap-3 mt-1 ml-5 text-xs text-muted-foreground">
                                  <SuggestionMeta suggestion={suggestion} confidence={confidence} />
                                </div>
                              </div>
                              <div className="flex gap-1 items-center shrink-0">
                                {!canAct && (
                                  // VISIBLE, not a tooltip: a disabled button fires no hover events.
                                  <span className="text-xs text-muted-foreground mr-1">{whyCannotAct(suggestion)}</span>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleDecline(suggestion.id)}
                                  disabled={isActing || !canAct}
                                  title={!canAct ? whyCannotAct(suggestion) : 'Decline'}
                                  aria-label="Decline"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                                <Button
                                  aria-label="Accept this suggestion"
                                  size="sm"
                                  onClick={() => void handleAccept(suggestion.id)}
                                  disabled={isActing || !canAct}
                                  title={
                                    !canAct
                                      ? whyCannotAct(suggestion)
                                      : suggestion.suggestionType === 'promote'
                                        ? 'Accept — makes this rule permanent'
                                        : 'Accept'
                                  }
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                            {expandedId === suggestion.id && (
                              <ConflictDetail suggestion={suggestion} deptNameById={deptNameById} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
