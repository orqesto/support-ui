import { Link } from 'react-router-dom';
import type { LearningSuggestion } from '@/services/learning.service';

/**
 * Review view for a `kb_review.capture` suggestion — what a person saved to the knowledge base.
 *
 * Shows the captured text itself, because that is what Approve vouches for: an approved entry is
 * quoted by the AI as ground truth. The payload carries a preview (the first 600 characters of
 * each entry, BE kbCaptureReview.ts); the full entry, and editing it, are one click away.
 */
type Entry = { id: number; title: string; content: string };

/** The one-line summary the suggestions list shows for a capture review. */
export const summarizeKbReview = (suggestion: LearningSuggestion): string => {
  const payload = suggestion.payload ?? {};
  const count = Array.isArray(payload.entryIds)
    ? payload.entryIds.length
    : suggestion.evidenceCount;
  const thread =
    typeof payload.conversationPublicId === 'string'
      ? payload.conversationPublicId
      : typeof payload.subject === 'string'
        ? `“${payload.subject}”`
        : 'a thread';
  const verb = payload.capturedVia === 'manual_promote' ? 'added from' : 'saved from';
  return `Review ${count === 1 ? '1 entry' : `${count} entries`} ${verb} ${thread}`;
};

/**
 * The metadata line under a suggestion. A capture review has no evidence score and never
 * expires — "Expires: 31/12/9999" would be noise, and a lie about urgency — so it says what
 * matters instead. Every other suggestion keeps evidence, confidence and expiry.
 */
export const SuggestionMeta = ({
  suggestion,
  confidence,
}: {
  suggestion: LearningSuggestion;
  confidence: number | null;
}) =>
  suggestion.domain === 'kb_review' ? (
    <span>
      Saved {new Date(suggestion.createdAt).toLocaleDateString()} — the AI does not use it until
      approved
    </span>
  ) : (
    <>
      <span>Evidence: {suggestion.evidenceCount}</span>
      {confidence !== null && <span>Confidence: {confidence}%</span>}
      <span>
        Expires:{' '}
        <span className="font-mono">{new Date(suggestion.expiresAt).toLocaleDateString()}</span>
      </span>
    </>
  );

const readEntries = (suggestion: LearningSuggestion): Entry[] => {
  const raw = suggestion.payload?.entries;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is Entry =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as Entry).id === 'number' &&
      typeof (row as Entry).content === 'string'
  );
};

export const KbReviewSuggestionDetail = ({ suggestion }: { suggestion: LearningSuggestion }) => {
  const entries = readEntries(suggestion);
  const conversationId = suggestion.payload?.conversationId;
  return (
    <div className="px-3 pb-3 ml-5 space-y-2 text-xs">
      {entries.length === 0 ? (
        <p className="text-muted-foreground">No preview was stored for this capture.</p>
      ) : (
        entries.map((entry) => (
          <div key={entry.id} className="p-2.5 rounded-md border border-border bg-muted/30">
            <div className="mb-1 font-medium text-foreground">{entry.title}</div>
            <p className="whitespace-pre-wrap break-words text-muted-foreground">{entry.content}</p>
            <Link
              to={`/knowledge-base?id=${entry.id}`}
              className="inline-block mt-1 text-primary hover:underline"
            >
              Open or edit the entry
            </Link>
          </div>
        ))
      )}
      {typeof conversationId === 'number' && (
        <Link to={`/messages?id=${conversationId}`} className="text-primary hover:underline">
          Open the thread it came from
        </Link>
      )}
    </div>
  );
};
