import { useEffect, useState } from 'react';
import { PenLine } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useUpdatePlatformDrafts } from '@/hooks/usePlatformSettings';
import type { DraftSettings, PlatformDraftsInput } from '@/services/platformSettings.service';
import { SourceBadge } from './SourceBadge';

export const AI_DRAFTS_NOT_DEPLOYED =
  'This server does not have this setting yet — it arrives with the next backend release.';

const asNumber = (text: string): number | null => {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) ? value : null;
};

const TITLE = 'AI drafts';

/**
 * Platform Defaults → AI drafts (2026-10-21): how similar one knowledge-base entry must be before a
 * suggested answer is written from it alone (`ai.kb_only_draft_min_similarity`), and how long
 * drafting may take before it is given up (`ai.suggestion_pipeline_timeout_ms`, shown in seconds).
 * Saved with a PARTIAL PUT /settings/drafts (only the fields that changed). The server is the
 * authority on bounds; the card only stops what it can see is wrong.
 */
export const AiDraftsCard = ({ drafts }: { drafts: DraftSettings | undefined }) => {
  const save = useUpdatePlatformDrafts();
  const savedSimilarity = drafts?.kbOnlyDraftMinSimilarity.value;
  const savedTimeoutMs = drafts?.suggestionPipelineTimeoutMs.value;
  const [similarityText, setSimilarityText] = useState(String(savedSimilarity ?? ''));
  const [secondsText, setSecondsText] = useState(
    savedTimeoutMs === undefined ? '' : String(savedTimeoutMs / 1000)
  );
  // Re-seed when the saved values arrive or change (the query refetches after a save).
  useEffect(() => {
    setSimilarityText(String(savedSimilarity ?? ''));
    setSecondsText(savedTimeoutMs === undefined ? '' : String(savedTimeoutMs / 1000));
  }, [savedSimilarity, savedTimeoutMs]);

  if (!drafts) {
    return (
      <Card data-config-card={TITLE}>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center text-xl">
            <PenLine className="w-5 h-5" />
            {TITLE}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{AI_DRAFTS_NOT_DEPLOYED}</p>
        </CardContent>
      </Card>
    );
  }

  const { kbOnlyDraftMinSimilarity: similarityField, suggestionPipelineTimeoutMs: timeoutField } =
    drafts;
  const similarity = asNumber(similarityText);
  const similarityError =
    similarity === null || similarity < similarityField.min || similarity > similarityField.max
      ? `Enter a number from ${similarityField.min} to ${similarityField.max}.`
      : undefined;
  const seconds = asNumber(secondsText);
  const timeoutMs = seconds === null ? null : Math.round(seconds * 1000);
  const minSeconds = timeoutField.min / 1000;
  const maxSeconds = timeoutField.max / 1000;
  const timeoutError =
    timeoutMs === null || timeoutMs < timeoutField.min || timeoutMs > timeoutField.max
      ? `Enter a number of seconds from ${minSeconds} to ${maxSeconds}.`
      : undefined;

  const changed: PlatformDraftsInput = {};
  if (similarity !== null && similarity !== similarityField.value) {
    changed.kbOnlyDraftMinSimilarity = similarity;
  }
  if (timeoutMs !== null && timeoutMs !== timeoutField.value) {
    changed.suggestionPipelineTimeoutMs = timeoutMs;
  }
  const nothingChanged = Object.keys(changed).length === 0;

  return (
    <Card data-config-card={TITLE}>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center text-xl">
          <PenLine className="w-5 h-5" />
          {TITLE}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          When the only match for a message is one knowledge-base entry, a draft is written from it
          only if it is at least this similar (0.7 is the bar to show it as a source). Drafting is
          given up after the time limit, and the agent sees the sources instead.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Input
              type="number"
              min={similarityField.min}
              max={similarityField.max}
              step={0.01}
              label="Similarity to draft from one KB entry"
              value={similarityText}
              error={similarityError}
              onChange={(event) => setSimilarityText(event.target.value)}
            />
            <SourceBadge source={similarityField.source} envLabel="Server setting" />
          </div>
          <div className="space-y-1">
            <Input
              type="number"
              min={minSeconds}
              max={maxSeconds}
              step={1}
              label="Drafting time limit (seconds)"
              value={secondsText}
              error={timeoutError}
              onChange={(event) => setSecondsText(event.target.value)}
            />
            <SourceBadge source={timeoutField.source} envLabel="Server setting" />
          </div>
        </div>
        <Button
          disabled={
            save.isPending ||
            nothingChanged ||
            similarityError !== undefined ||
            timeoutError !== undefined
          }
          onClick={() => save.mutate(changed)}
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
};
