import { answerToEditorHtml } from './messageDetailConstants';

/**
 * Render a suggested/past reply the way it will actually look, not as its source.
 *
 * These previews used to print the string raw. A generated AI answer is plain text
 * with markdown-ish syntax, so it read fine; a PAST REPLY or KB answer is stored as
 * the HTML it was sent as, so the agent was shown literal
 * `<p>Hello,</p><p>Here's the full ingredient list…` (ORB-SUP-1395).
 *
 * `answerToEditorHtml` is the same converter the "Use" button runs before dropping
 * the answer into the composer, so what an agent reads here is exactly what they get
 * — one sanitizer, one allowlist, no drift between preview and insertion.
 *
 * ⛔ The `[&_…]` rules are load-bearing: the typography plugin is NOT installed, so
 * `prose` is inert and preflight has already flattened list markers and paragraph
 * margins. Without them the rendered HTML reads as one run-on block.
 */
const PREVIEW_HTML =
  'break-words [overflow-wrap:anywhere] [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 ' +
  '[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 ' +
  '[&_a]:underline [&_pre]:whitespace-pre-wrap [&_blockquote]:pl-2 [&_blockquote]:border-l [&_blockquote]:border-current/30';

export function AnswerPreview({ answer, className }: { answer: string; className?: string }) {
  return (
    <div
      className={`${className ?? ''} ${PREVIEW_HTML}`}
      dangerouslySetInnerHTML={{ __html: answerToEditorHtml(answer) }}
    />
  );
}
