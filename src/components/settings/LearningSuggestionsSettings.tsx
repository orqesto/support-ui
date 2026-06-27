import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Check, X, RefreshCw, AlertCircle, ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useDepartments } from '@/hooks/useDepartments';
import { usePermissions } from '@/hooks/usePermissions';
import {
  learningService,
  type LearningSuggestion,
  type SuggestionEvidenceItem,
} from '@/services/learning.service';
import { logger } from '@/lib/logger';
import { useAuthStore } from '@/stores/authStore';

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

// Severity pill — only meaningful for resolve_conflict rows. cross_dept_overlap
// is the hard conflict (centroid cosine >= 0.92 detected at cron time);
// cross_dept_warn_overlap is the borderline overlap (0.85-0.92 detected at
// materialize time, emitted by L2). Amber vs red signals the disposition gap:
// hard conflicts need real action (one rule is wrong); soft overlaps are an
// invitation to consolidate. Other suggestion types render no pill.
const SeverityBadge = ({ suggestion }: { suggestion: LearningSuggestion }) => {
  if (suggestion.suggestionType !== 'resolve_conflict') return null;
  const payload = suggestion.payload ?? {};
  const conflictType = typeof payload.conflictType === 'string' ? payload.conflictType : '';
  if (conflictType === 'cross_dept_warn_overlap') {
    return (
      <span
        className="inline-flex items-center h-4 px-1.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-300"
        title="Borderline cross-dept overlap (cosine 0.85-0.92). Soft signal — these rules may converge over time. Not blocking."
      >
        Soft
      </span>
    );
  }
  if (conflictType === 'cross_dept_overlap' || conflictType === 'category_mismatch') {
    return (
      <span
        className="inline-flex items-center h-4 px-1.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-red-500/15 text-red-700 dark:text-red-300"
        title="Hard conflict — two rules disagree at high similarity. Admin action needed."
      >
        Hard
      </span>
    );
  }
  return null;
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
    // routing cross_dept_warn_overlap (L2 warn-band): emitted at materialize
    // time so the payload shape differs from cron-time conflicts — only
    // ruleAId/ruleBId, deptIdA/deptIdB, similarity, and attemptedSubject are
    // populated. No ruleAValue/ruleBValue. Surface dept names + similarity
    // pct as the headline; the trigger subject lands in the detail panel.
    if (conflictType === 'cross_dept_warn_overlap') {
      const deptIdA = typeof evidence.deptIdA === 'number' ? evidence.deptIdA : null;
      const deptIdB = typeof evidence.deptIdB === 'number' ? evidence.deptIdB : null;
      const deptA = deptIdA !== null ? (deptNameById(deptIdA) ?? `dept #${deptIdA}`) : null;
      const deptB = deptIdB !== null ? (deptNameById(deptIdB) ?? `dept #${deptIdB}`) : null;
      const similarity = typeof evidence.similarity === 'number' ? evidence.similarity : null;
      const simClause = similarity !== null ? ` (${(similarity * 100).toFixed(0)}% similar)` : '';
      if (deptA && deptB) return `Soft overlap: ${deptA} ↔ ${deptB}${simClause}`;
      return `Soft overlap${simClause}`;
    }
    return conflictType ? `Resolve conflict (${conflictType.replace(/_/g, ' ')})` : 'Resolve conflict';
  }
  return suggestion.suggestionType.replace(/_/g, ' ');
};

// Evidence section — lazy-fetched on first expand. Shows the actual messages
// behind the conflict with per-rule match badges and a deep-link to the
// conversation, so admins can judge whether the conflict is real on
// user-visible traffic before clicking Accept/Decline.
const EvidenceSection = ({ suggestionId }: { suggestionId: number }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SuggestionEvidenceItem[] | null>(null);
  // Track the BE's scannedCount alongside items so the empty-state copy can
  // distinguish "no traffic yet" (scannedCount === 0) from "scanned N, none
  // co-matched" (scannedCount > 0 — often a false-positive conflict).
  const [scannedCount, setScannedCount] = useState<number | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    // Lazy-load: only fetch on first expand. Subsequent toggles use cache.
    if (next && items === null && !loading) {
      setLoading(true);
      setError(null);
      try {
        const response = await learningService.getSuggestionEvidence(suggestionId);
        setItems(response.evidence);
        setScannedCount(response.scannedCount);
      } catch (err) {
        logger.error('Failed to load suggestion evidence:', err);
        setError('Failed to load evidence');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-border/40">
      <button
        type="button"
        onClick={() => void toggle()}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Eye className="w-3 h-3" />
        Evidence messages
      </button>
      {open && (
        <div className="mt-2">
          {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          {!loading && !error && items !== null && items.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              {scannedCount === 0
                ? 'No messages in the last 30 days yet. Evidence will appear as traffic arrives.'
                : typeof scannedCount === 'number' && scannedCount > 0
                  ? `Scanned ${scannedCount.toLocaleString()} recent messages; none matched both rules. This conflict may be a false positive — consider declining if you don't expect these rules to ever co-fire.`
                  : 'No evidence messages available for this suggestion.'}
            </p>
          )}
          {!loading && !error && items !== null && items.length > 0 && (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.messageId}
                  className="rounded-md border border-border/60 bg-background/40 p-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <Link
                      to={`/messages/${item.conversationId}`}
                      className="text-xs font-medium text-primary hover:underline truncate max-w-[280px]"
                      title={item.subject ?? '(no subject)'}
                    >
                      {item.subject && item.subject.length > 0
                        ? item.subject
                        : '(no subject)'}
                    </Link>
                    {item.ruleAMatched && (
                      <span className="inline-flex items-center h-4 px-1 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        A
                      </span>
                    )}
                    {item.ruleBMatched && (
                      <span className="inline-flex items-center h-4 px-1 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-700 dark:text-sky-300">
                        B
                      </span>
                    )}
                    {item.ruleAMatched && item.ruleBMatched && (
                      <span
                        className="inline-flex items-center h-4 px-1 rounded text-[10px] font-semibold bg-red-500/15 text-red-700 dark:text-red-300"
                        title="This message matches both rules — the conflict is real here"
                      >
                        Overlap
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {item.contentExcerpt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
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
  // Block-band conflicts (cron) carry `centroidCosine`; warn-band (L2 at
  // materialize) carries `similarity`; older shapes used `cosine`. Treat all
  // three as the same admin-facing number.
  const cosine =
    typeof evidence.centroidCosine === 'number'
      ? evidence.centroidCosine
      : typeof evidence.cosine === 'number'
        ? evidence.cosine
        : typeof evidence.similarity === 'number'
          ? evidence.similarity
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
  } else if (conflictType === 'cross_dept_warn_overlap') {
    // Warn-band payload (emitted by L2 at materialize) doesn't include rule
    // values or types — only the pair ids, dept ids, similarity, and the
    // subject that triggered it. Show what we have, surface the trigger
    // subject so admins can sanity-check whether the overlap is meaningful.
    const deptIdA = typeof evidence.deptIdA === 'number' ? evidence.deptIdA : null;
    const deptIdB = typeof evidence.deptIdB === 'number' ? evidence.deptIdB : null;
    if (typeof payload.ruleAId === 'number') rows.push({ label: 'Rule A', value: `#${payload.ruleAId}` });
    if (deptIdA !== null) rows.push({ label: 'Dept A', value: deptNameById(deptIdA) ?? `#${deptIdA}` });
    if (typeof payload.ruleBId === 'number') rows.push({ label: 'Rule B', value: `#${payload.ruleBId}` });
    if (deptIdB !== null) rows.push({ label: 'Dept B', value: deptNameById(deptIdB) ?? `#${deptIdB}` });
    if (typeof evidence.attemptedSubject === 'string' && evidence.attemptedSubject.length > 0) {
      rows.push({ label: 'Trigger', value: `"${evidence.attemptedSubject}"` });
    }
    rows.push({
      label: 'Problem',
      value:
        'Borderline cross-dept overlap (similarity 85–92%). Not a hard conflict — both rules can coexist — but they may converge over time. Accepting consolidates them; declining records that they should stay distinct.',
    });
  } else {
    const idA = typeof payload.ruleAId === 'number' ? String(payload.ruleAId) : '—';
    const idB = typeof payload.ruleBId === 'number' ? String(payload.ruleBId) : '—';
    rows.push({ label: 'Rule A ID', value: idA });
    rows.push({ label: 'Rule B ID', value: idB });
  }

  if (cosine !== null) rows.push({ label: 'Similarity', value: `${(cosine * 100).toFixed(1)}%` });

  // Only routing conflicts have ruleAId/ruleBId in payload → evidence endpoint
  // returns useful data. Skip the Evidence affordance for non-routing shapes
  // (category_mismatch, etc.) to keep the UI honest.
  const hasRulePair =
    typeof payload.ruleAId === 'number' && typeof payload.ruleBId === 'number';

  return (
    <div className="px-3 pb-3 ml-5">
      <dl className="mt-1 space-y-1 text-xs">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex gap-2">
            <dt className="shrink-0 w-24 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 flex-1 text-foreground break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        <strong>Accept</strong> = engine resolves it (disables the weaker rule).{' '}
        <strong>Decline</strong> = not a real conflict, stop surfacing it.
      </p>
      {hasRulePair && <EvidenceSection suggestionId={suggestion.id} />}
    </div>
  );
};

export const LearningSuggestionsSettings = () => {
  const { isOrgAdmin } = usePermissions();
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

  // Refetch when the active organization changes. The api-client attaches the
  // current org as X-Organization-Context on every request, but this panel fetches
  // imperatively — without keying the effect on selectedOrganizationId it would keep
  // showing whichever org was active at mount (cross-org stale data). Clear first so
  // the previous org's rows don't flash while the refetch is in flight.
  useEffect(() => {
    setSuggestions([]);
    void load();
  }, [load, selectedOrganizationId]);

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
                              className="flex items-start gap-1 text-left w-full min-w-0 group"
                              onClick={() => setExpandedId((prev) => prev === suggestion.id ? null : suggestion.id)}
                            >
                              {expandedId === suggestion.id
                                ? <ChevronDown className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                : <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                              }
                              <p className="min-w-0 break-words text-sm font-medium group-hover:underline">
                                <span className="mr-1.5 inline-flex align-middle"><SeverityBadge suggestion={suggestion} /></span>
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
