import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Check, X, RefreshCw, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useDepartments } from '@/hooks/useDepartments';
import { usePermissions } from '@/hooks/usePermissions';
import { learningService, type LearningSuggestion } from '@/services/learning.service';
import { logger } from '@/lib/logger';

const DOMAIN_LABELS: Record<string, string> = {
  routing: 'Routing',
  spam: 'Spam',
  category: 'Category',
  suggested_reply: 'Suggested Reply',
  auto_reply: 'Auto-Reply',
  auto_reply_block: 'Auto-Reply Block',
  kb_extraction: 'KB Extraction',
  kb_scope: 'KB Scope',
  kb_quality: 'KB Quality',
  sentiment: 'Sentiment',
  lead: 'Lead',
  multi_topic: 'Multi-Topic',
  sla: 'SLA',
  resolution_quality: 'Resolution Quality',
};

// Best-effort one-liner summary of a suggestion. The payload shape varies by
// (domain, suggestionType) — fall back to a generic line if we don't recognize.
// Reference payload shapes (BE source of truth):
//   routingAnalyzer add_rule → { ruleType, value, targetDeptId, sourceDeptId, proposedWeight, sampleSubjects }
//   spamAnalyzer add_pattern / remove_pattern → { phrase, direction }
const summarizeSuggestion = (
  suggestion: LearningSuggestion,
  deptNameById: (id: number) => string | undefined
): string => {
  const payload = suggestion.payload ?? {};
  if (suggestion.suggestionType === 'add_rule') {
    const value = typeof payload.value === 'string' ? payload.value : '';
    const ruleType = typeof payload.ruleType === 'string' ? payload.ruleType : 'pattern';
    const targetDeptId =
      typeof payload.targetDeptId === 'number' ? payload.targetDeptId : null;
    const targetName = targetDeptId !== null ? deptNameById(targetDeptId) : null;
    const targetClause = targetName
      ? ` → ${targetName}`
      : targetDeptId !== null
        ? ` → dept #${targetDeptId}`
        : '';
    return `Add ${ruleType} rule${value ? `: "${value}"` : ''}${targetClause}`;
  }
  if (suggestion.suggestionType === 'add_pattern' || suggestion.suggestionType === 'remove_pattern') {
    const phrase = typeof payload.phrase === 'string' ? payload.phrase : '';
    const verb = suggestion.suggestionType === 'add_pattern' ? 'Add spam pattern' : 'Remove spam pattern';
    return phrase ? `${verb}: "${phrase}"` : verb;
  }
  if (suggestion.suggestionType === 'adjust_threshold') {
    const fromValue = payload.from;
    const toValue = payload.to;
    if (typeof fromValue === 'number' && typeof toValue === 'number') {
      return `Adjust threshold ${Math.round(fromValue * 100)}% → ${Math.round(toValue * 100)}%`;
    }
    return 'Adjust threshold';
  }
  if (suggestion.suggestionType === 'flag_low_quality') {
    return 'Flag low-quality output for review';
  }
  if (suggestion.suggestionType === 'promote') {
    const value = typeof payload.value === 'string' ? payload.value : '';
    const ruleType = typeof payload.ruleType === 'string' ? payload.ruleType : 'rule';
    return value ? `Promote ${ruleType}: "${value}"` : 'Promote provisional rule';
  }
  if (suggestion.suggestionType === 'resolve_conflict') {
    const evidence =
      typeof payload.evidence === 'object' && payload.evidence !== null
        ? (payload.evidence as Record<string, unknown>)
        : {};
    const conflictType = typeof payload.conflictType === 'string' ? payload.conflictType : '';
    // spam category_mismatch: show rule names + categories
    if (conflictType === 'category_mismatch') {
      const nameA = typeof evidence.ruleAName === 'string' ? evidence.ruleAName : null;
      const nameB = typeof evidence.ruleBName === 'string' ? evidence.ruleBName : null;
      const catA = typeof evidence.ruleACategory === 'string' ? evidence.ruleACategory : null;
      const catB = typeof evidence.ruleBCategory === 'string' ? evidence.ruleBCategory : null;
      if (nameA && nameB) {
        const catClause = catA && catB ? ` (${catA} vs ${catB})` : '';
        return `Resolve conflict: "${nameA}" ↔ "${nameB}"${catClause}`;
      }
    }
    // routing cross_dept_overlap: show rule values + dept names
    if (conflictType === 'cross_dept_overlap') {
      const deptIdA = typeof evidence.deptIdA === 'number' ? evidence.deptIdA : null;
      const deptIdB = typeof evidence.deptIdB === 'number' ? evidence.deptIdB : null;
      const deptA = deptIdA !== null ? (deptNameById(deptIdA) ?? `dept #${deptIdA}`) : null;
      const deptB = deptIdB !== null ? (deptNameById(deptIdB) ?? `dept #${deptIdB}`) : null;
      const valA = typeof evidence.ruleAValue === 'string' ? evidence.ruleAValue : null;
      const valB = typeof evidence.ruleBValue === 'string' ? evidence.ruleBValue : null;
      if (deptA && deptB && valA && valB) return `Resolve conflict: "${valA}" (${deptA}) ↔ "${valB}" (${deptB})`;
      if (deptA && deptB) return `Resolve conflict: ${deptA} ↔ ${deptB}`;
    }
    return conflictType ? `Resolve conflict (${conflictType.replace(/_/g, ' ')})` : 'Resolve conflict';
  }
  return suggestion.suggestionType.replace(/_/g, ' ');
};

const ConflictDetail = ({
  suggestion,
  deptNameById,
}: {
  suggestion: LearningSuggestion;
  deptNameById: (id: number) => string | undefined;
}) => {
  const payload = suggestion.payload ?? {};
  const evidence =
    typeof payload.evidence === 'object' && payload.evidence !== null
      ? (payload.evidence as Record<string, unknown>)
      : {};
  const conflictType = typeof payload.conflictType === 'string' ? payload.conflictType : '';
  const cosine =
    typeof evidence.centroidCosine === 'number'
      ? evidence.centroidCosine
      : typeof evidence.cosine === 'number'
        ? evidence.cosine
        : null;

  const rows: { label: string; value: string }[] = [];

  if (conflictType === 'category_mismatch') {
    if (typeof evidence.ruleAName === 'string') rows.push({ label: 'Rule A', value: evidence.ruleAName });
    if (typeof evidence.ruleACategory === 'string') rows.push({ label: 'Category A', value: evidence.ruleACategory });
    if (typeof evidence.ruleBName === 'string') rows.push({ label: 'Rule B', value: evidence.ruleBName });
    if (typeof evidence.ruleBCategory === 'string') rows.push({ label: 'Category B', value: evidence.ruleBCategory });
    rows.push({ label: 'Problem', value: 'Two spam rules with similar content disagree on category. Accepting lets the engine disable the lower-confidence one.' });
  } else if (conflictType === 'cross_dept_overlap') {
    const deptIdA = typeof evidence.deptIdA === 'number' ? evidence.deptIdA : null;
    const deptIdB = typeof evidence.deptIdB === 'number' ? evidence.deptIdB : null;
    if (typeof evidence.ruleAValue === 'string') rows.push({ label: 'Rule A', value: `"${evidence.ruleAValue}" (${typeof evidence.ruleAType === 'string' ? evidence.ruleAType : 'rule'})` });
    if (deptIdA !== null) rows.push({ label: 'Dept A', value: deptNameById(deptIdA) ?? `#${deptIdA}` });
    if (typeof evidence.ruleBValue === 'string') rows.push({ label: 'Rule B', value: `"${evidence.ruleBValue}" (${typeof evidence.ruleBType === 'string' ? evidence.ruleBType : 'rule'})` });
    if (deptIdB !== null) rows.push({ label: 'Dept B', value: deptNameById(deptIdB) ?? `#${deptIdB}` });
    rows.push({ label: 'Problem', value: 'Two routing rules in different departments match very similar messages. Accepting merges or removes the weaker one.' });
  } else {
    const idA = typeof payload.ruleAId === 'number' ? String(payload.ruleAId) : '—';
    const idB = typeof payload.ruleBId === 'number' ? String(payload.ruleBId) : '—';
    rows.push({ label: 'Rule A ID', value: idA });
    rows.push({ label: 'Rule B ID', value: idB });
  }

  if (cosine !== null) rows.push({ label: 'Similarity', value: `${(cosine * 100).toFixed(1)}%` });

  return (
    <div className="px-3 pb-3 ml-5">
      <dl className="mt-1 space-y-1 text-xs">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex gap-2">
            <dt className="shrink-0 w-24 text-muted-foreground">{label}</dt>
            <dd className="text-foreground break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        <strong>Accept</strong> = engine resolves it (disables the weaker rule).{' '}
        <strong>Decline</strong> = not a real conflict, stop surfacing it.
      </p>
    </div>
  );
};

export const LearningSuggestionsSettings = () => {
  const { isOrgAdmin } = usePermissions();
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await learningService.listSuggestions();
      setSuggestions(rows);
    } catch (err) {
      logger.error('Failed to load learning suggestions:', err);
      setError('Failed to load suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAccept = async (id: number) => {
    setActingId(id);
    try {
      await learningService.acceptSuggestion(id);
      setSuggestions((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      logger.error('Failed to accept suggestion:', err);
      setError('Failed to accept the suggestion. Please try again.');
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
      setError('Failed to decline the suggestion. Please try again.');
    } finally {
      setActingId(null);
    }
  };

  // Group by domain so admins can scan one bucket at a time.
  const byDomain = useMemo(() => {
    const map = new Map<string, LearningSuggestion[]>();
    for (const row of suggestions) {
      const list = map.get(row.domain) ?? [];
      list.push(row);
      map.set(row.domain, list);
    }
    return map;
  }, [suggestions]);

  // accept / decline routes require org_admin — hide the panel for non-admins
  // rather than rendering a list with action buttons that always 403.
  if (!isOrgAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex gap-2 items-center">
            <Sparkles className="w-5 h-5" />
            Learning Suggestions
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          The nightly learning analyzer clusters agent overrides into actionable suggestions.
          Accepting applies the change immediately; declining records the rejection so the analyzer
          can learn what not to surface.
        </p>

        {error && (
          <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md text-sm bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading suggestions…</p>
        ) : suggestions.length === 0 ? (
          <div className="py-8 text-center">
            <Sparkles className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No pending suggestions.</p>
            <p className="text-xs text-muted-foreground mt-1">
              The analyzer runs nightly. Suggestions appear once enough agent overrides have
              accumulated to form a high-confidence cluster.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(byDomain.entries()).map(([domain, rows]) => (
              <div key={domain}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {DOMAIN_LABELS[domain] ?? domain} ({rows.length})
                </h4>
                <div className="space-y-2">
                  {rows.map((suggestion) => {
                    const confidence = suggestion.confidence
                      ? Math.round(Number(suggestion.confidence) * 100)
                      : null;
                    const isActing = actingId === suggestion.id;
                    return (
                      <div
                        key={suggestion.id}
                        className="rounded-lg border border-border bg-background"
                      >
                        <div className="flex justify-between gap-3 items-start p-3">
                          <div className="flex-1 min-w-0">
                            <button
                              className="flex items-center gap-1 text-left w-full group"
                              onClick={() => setExpandedId((prev) => prev === suggestion.id ? null : suggestion.id)}
                            >
                              {expandedId === suggestion.id
                                ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              }
                              <p className="text-sm font-medium group-hover:underline">
                                {summarizeSuggestion(suggestion, deptNameById)}
                              </p>
                            </button>
                            <div className="flex flex-wrap gap-3 mt-1 ml-5 text-xs text-muted-foreground">
                              <span>Evidence: {suggestion.evidenceCount}</span>
                              {confidence !== null && <span>Confidence: {confidence}%</span>}
                              <span>
                                Expires: {new Date(suggestion.expiresAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleDecline(suggestion.id)}
                              disabled={isActing}
                              title="Decline"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => void handleAccept(suggestion.id)}
                              disabled={isActing}
                              title="Accept"
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
