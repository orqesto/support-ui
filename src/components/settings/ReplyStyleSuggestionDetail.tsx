import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { LearningSuggestion } from '@/services/learning.service';
import { diffWords, hasRealChange } from './replyStyleDiff';

/**
 * Review view for a `reply_style.update` suggestion.
 *
 * Every other learning suggestion proposes a discrete rule — a pattern, a
 * threshold, a routing target — so the shared conflict detail renders labelled
 * key/value rows. reply_style proposes PROSE: the house-voice guidance injected
 * into every AI draft. Accepting it changes how every future draft reads, which
 * is not a decision anyone can make from a one-line summary, so this view leads
 * with the word-level diff and keeps the raw blocks one click away.
 *
 * Payload (BE `replyStyleLearningDomain`):
 *   { currentStyle, proposedStyle, rationale,
 *     signals: { avgLengthDeltaPct, distinctConvs, distinctAgents } }
 */

type ReplyStylePayload = {
  currentStyle: string;
  proposedStyle: string;
  rationale: string;
  avgLengthDeltaPct: number | null;
  distinctConvs: number | null;
  distinctAgents: number | null;
};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const readReplyStylePayload = (suggestion: LearningSuggestion): ReplyStylePayload => {
  const payload = suggestion.payload ?? {};
  const signals =
    typeof payload.signals === 'object' && payload.signals !== null
      ? (payload.signals as Record<string, unknown>)
      : {};
  return {
    currentStyle: asString(payload.currentStyle),
    proposedStyle: asString(payload.proposedStyle),
    rationale: asString(payload.rationale),
    avgLengthDeltaPct: asNumber(signals.avgLengthDeltaPct),
    distinctConvs: asNumber(signals.distinctConvs),
    distinctAgents: asNumber(signals.distinctAgents),
  };
};

const RawBlock = ({ label, text }: { label: string; text: string }) => (
  <div className="min-w-0">
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
    <p className="p-2 rounded border border-border bg-muted/30 text-xs whitespace-pre-wrap break-words text-foreground">
      {text || <span className="text-muted-foreground">(none set)</span>}
    </p>
  </div>
);

export const ReplyStyleSuggestionDetail = ({
  suggestion,
}: {
  suggestion: LearningSuggestion;
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const { currentStyle, proposedStyle, rationale, avgLengthDeltaPct, distinctConvs, distinctAgents } =
    useMemo(() => readReplyStylePayload(suggestion), [suggestion]);
  const segments = useMemo(
    () => diffWords(currentStyle, proposedStyle),
    [currentStyle, proposedStyle]
  );

  // A proposal that survives the BE's own guard always has proposedStyle; guard
  // anyway so a malformed row degrades to "nothing to show" instead of an empty
  // green box that reads like an approved no-op.
  if (!proposedStyle) {
    return (
      <div className="px-3 pb-3 ml-5 text-xs text-muted-foreground">
        This suggestion carries no proposed style — decline it.
      </div>
    );
  }

  const lengthDelta =
    avgLengthDeltaPct === null ? null : `${avgLengthDeltaPct > 0 ? '+' : ''}${Math.round(avgLengthDeltaPct * 100)}%`;

  return (
    <div className="px-3 pb-3 ml-5 space-y-2.5">
      {rationale && <p className="text-xs text-muted-foreground">{rationale}</p>}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Edited drafts: {suggestion.evidenceCount}</span>
        {distinctConvs !== null && <span>Conversations: {distinctConvs}</span>}
        {distinctAgents !== null && <span>Agents: {distinctAgents}</span>}
        {lengthDelta !== null && (
          <span title="Average length change from AI draft to what the agent actually sent">
            Agents’ edits changed length: {lengthDelta}
          </span>
        )}
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {currentStyle ? 'Proposed change to the house style' : 'Proposed house style (none set today)'}
        </div>
        <p className="p-2 rounded border border-border bg-background text-xs whitespace-pre-wrap break-words leading-relaxed">
          {hasRealChange(currentStyle, proposedStyle) ? (
            segments.map((segment, index) => {
              if (segment.type === 'same') return <span key={index}>{segment.text}</span>;
              if (segment.type === 'removed') {
                return (
                  <span
                    key={index}
                    className="rounded-sm bg-red-500/10 text-red-700 line-through dark:text-red-300"
                  >
                    {segment.text}
                  </span>
                );
              }
              return (
                <span
                  key={index}
                  className="rounded-sm bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                >
                  {segment.text}
                </span>
              );
            })
          ) : (
            <span className="text-muted-foreground">
              No wording change — the proposal matches the current style. Decline it.
            </span>
          )}
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="px-0 h-auto text-xs text-muted-foreground hover:bg-transparent hover:underline"
        onClick={() => setShowRaw((prev) => !prev)}
      >
        {showRaw ? 'Hide the full text' : 'Show both versions in full'}
      </Button>

      {showRaw && (
        <div className="grid gap-2 sm:grid-cols-2">
          <RawBlock label="Current" text={currentStyle} />
          <RawBlock label="Proposed" text={proposedStyle} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        <strong>Accept</strong> = this becomes the house-style guidance on every AI-drafted reply
        (the current wording is kept as a previous version). <strong>Decline</strong> = keep the
        current voice; the edits stay recorded and a new proposal can follow.
      </p>
    </div>
  );
};
