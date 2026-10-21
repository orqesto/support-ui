import { type LearningSuggestion } from '@/services/learning.service';
import { isKbConsolidationSuggestion, isKbQualitySuggestion } from '@/lib/learningSuggestionPermissions';
import { summarizeKbReview } from './KbReviewSuggestionDetail';
import { summarizeKbMerge, summarizeKbQuality } from './KbMergeInboxParts';
import { EvidenceSection } from './ConflictEvidenceSection';

/** Shared by Learning activity and the per-feature "Suggestions" panels (FeatureSuggestions). */

export const DOMAIN_LABELS: Record<string, string> = {
  routing: 'Routing',
  spam: 'Spam',
  category: 'Category',
  suggested_reply: 'Suggested Reply',
  auto_reply: 'Auto-Reply',
  auto_reply_block: 'Auto-Reply Block',
  kb_extraction: 'KB Extraction',
  kb_scope: 'KB Scope',
  kb_quality: 'KB Quality',
  kb_review: 'Knowledge base review',
  reply_style: 'Reply Style',
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
export const SeverityBadge = ({ suggestion }: { suggestion: LearningSuggestion }) => {
  if (suggestion.suggestionType !== 'resolve_conflict') return null;
  const payload = suggestion.payload ?? {};
  const conflictType = typeof payload.conflictType === 'string' ? payload.conflictType : '';
  if (conflictType === 'cross_dept_warn_overlap') {
    return (
      <span
        className="font-display inline-flex items-center h-4 px-1.5 rounded text-[10px] font-semibold uppercase tracking-[0.09em] bg-warning/15 text-warning"
        title="Borderline cross-dept overlap (cosine 0.85-0.92). Soft signal — these rules may converge over time. Not blocking."
      >
        Soft
      </span>
    );
  }
  if (conflictType === 'cross_dept_overlap' || conflictType === 'category_mismatch') {
    return (
      <span
        className="font-display inline-flex items-center h-4 px-1.5 rounded text-[10px] font-semibold uppercase tracking-[0.09em] bg-destructive/15 text-destructive"
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
export const summarizeSuggestion = (
  suggestion: LearningSuggestion,
  deptNameById: (id: number) => string | undefined
): string => {
  const payload = suggestion.payload ?? {};
  if (isKbConsolidationSuggestion(suggestion)) return summarizeKbMerge(payload, suggestion.suggestionType);
  if (isKbQualitySuggestion(suggestion)) return summarizeKbQuality(payload);
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
  if (suggestion.suggestionType === 'kb_review.capture') return summarizeKbReview(suggestion);
  if (suggestion.suggestionType === 'reply_style.update') {
    const signals =
      typeof payload.signals === 'object' && payload.signals !== null
        ? (payload.signals as Record<string, unknown>)
        : {};
    const convs = typeof signals.distinctConvs === 'number' ? signals.distinctConvs : null;
    const agents = typeof signals.distinctAgents === 'number' ? signals.distinctAgents : null;
    const from =
      convs !== null && agents !== null
        ? ` — from ${suggestion.evidenceCount} edited drafts across ${convs} thread${convs === 1 ? '' : 's'}, ${agents} agent${agents === 1 ? '' : 's'}`
        : '';
    return `Update the house reply style${from}`;
  }
  if (suggestion.suggestionType === 'flag_low_quality') {
    return 'Flag low-quality output for review';
  }
  if (suggestion.suggestionType === 'promote') {
    // BE payload: { ruleId, ruleTable, summary, counterfactualRatio, recommendation } (learningEngine.ts).
    if (typeof payload.summary === 'string' && payload.summary) return `Promote: ${payload.summary}`;
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

export type Refinement = {
  target: 'A' | 'B';
  targetRuleId: number;
  token: string;
  oldValue: string;
  proposedValue: string;
  rationale: string;
};

// Read the BE-computed refinement (proposed tightened pattern for the weaker /
// over-reaching rule) off a conflict suggestion's evidence, if present.
export const readRefinement = (suggestion: LearningSuggestion): Refinement | null => {
  const payload = suggestion.payload ?? {};
  const evidence =
    typeof payload.evidence === 'object' && payload.evidence !== null
      ? (payload.evidence as Record<string, unknown>)
      : {};
  const raw = evidence.refinement;
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (
    (obj.target !== 'A' && obj.target !== 'B') ||
    typeof obj.targetRuleId !== 'number' ||
    typeof obj.oldValue !== 'string' ||
    typeof obj.proposedValue !== 'string'
  ) {
    return null;
  }
  return {
    target: obj.target,
    targetRuleId: obj.targetRuleId,
    token: typeof obj.token === 'string' ? obj.token : '',
    oldValue: obj.oldValue,
    proposedValue: obj.proposedValue,
    rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
  };
};

export const ConflictDetail = ({
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

  // Which rule Accept keeps vs disables (resolved by the BE from the same
  // strength ranking Accept uses). Shown for any conflict whose pair is still
  // live; dept suffix only when the payload carries dept ids (routing).
  const winnerRuleId = typeof evidence.winnerRuleId === 'number' ? evidence.winnerRuleId : null;
  const loserRuleId = typeof evidence.loserRuleId === 'number' ? evidence.loserRuleId : null;
  if (winnerRuleId !== null && loserRuleId !== null) {
    const ruleAId = typeof payload.ruleAId === 'number' ? payload.ruleAId : null;
    const deptIdA = typeof evidence.deptIdA === 'number' ? evidence.deptIdA : null;
    const deptIdB = typeof evidence.deptIdB === 'number' ? evidence.deptIdB : null;
    const deptSuffix = (ruleId: number): string => {
      if (ruleAId === null || deptIdA === null || deptIdB === null) return '';
      const deptId = ruleId === ruleAId ? deptIdA : deptIdB;
      return ` (${deptNameById(deptId) ?? `#${deptId}`})`;
    };
    rows.push({ label: 'Keeps', value: `rule #${winnerRuleId}${deptSuffix(winnerRuleId)}` });
    rows.push({ label: 'Disables', value: `rule #${loserRuleId}${deptSuffix(loserRuleId)}` });
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
        {readRefinement(suggestion) && (
          <>
            <strong>Refine</strong> = tighten the over-reaching rule so both survive (preferred).{' '}
          </>
        )}
        <strong>Accept</strong> = disables the weaker rule (see Keeps/Disables above).{' '}
        <strong>Decline</strong> = not a real conflict, stop surfacing it.
      </p>
      {hasRulePair && <EvidenceSection suggestionId={suggestion.id} />}
    </div>
  );
};
