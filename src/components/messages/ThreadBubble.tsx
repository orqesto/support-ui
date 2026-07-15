import { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import DOMPurify from 'dompurify';
import { THREAD_SANITIZE, addNoopenerHook, renderMarkdown, splitAtQuote } from './messageDetailConstants';

addNoopenerHook(DOMPurify);

export function ThreadBubble({ content, isAgent }: { content: string | null | undefined; isAgent: boolean }) {
  const [showQuote, setShowQuote] = useState(false);
  // Content can be null (e.g. an attachment-only message or a body that failed to
  // extract) — coerce to '' so the regex/split helpers below don't throw.
  const safeContent = content ?? '';
  const isHtml = /<[a-z][\s\S]*>/i.test(safeContent);
  const { main, quote } = useMemo(() => splitAtQuote(safeContent, isHtml), [safeContent, isHtml]);

  // `[overflow-wrap:anywhere]` so a long unbroken token (e.g. a 200-char tracking
  // URL) wraps instead of overflowing the bubble — overflow-wrap isn't inherited,
  // so the wrapper's break-words doesn't reach this nested prose div. Without it
  // the narrow side-panel preview clips the real content off-screen.
  const base = 'prose prose-sm max-w-none break-words [overflow-wrap:anywhere] [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0';
  const prose = isAgent ? `${base} prose-invert dark:prose-invert` : base;

  const renderHtml = (html: string) => (
    <div
      className={prose}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, THREAD_SANITIZE) }}
    />
  );
  const renderText = (text: string) => (
    <div
      className={prose}
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(renderMarkdown(text), {
          ALLOWED_TAGS: ['strong', 'em', 'code', 'br'],
          ALLOWED_ATTR: [],
        }),
      }}
    />
  );
  const render = (chunk: string) => (isHtml ? renderHtml(chunk) : renderText(chunk));

  return (
    <>
      {render(main)}
      {quote && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            setShowQuote((val) => !val);
          }}
          className={`text-[10px] mt-1.5 flex items-center gap-0.5 transition-opacity ${
            isAgent
              ? 'text-primary-foreground/55 hover:text-primary-foreground/90'
              : 'text-muted-foreground/55 hover:text-muted-foreground'
          }`}
        >
          <ChevronDown
            className={`w-2.5 h-2.5 transition-transform duration-150 ${showQuote ? 'rotate-180' : ''}`}
          />
          {showQuote ? 'hide quoted' : 'show quoted'}
        </button>
      )}
      {quote && showQuote && (
        <div
          className={`mt-1 border-l-2 pl-2 opacity-60 ${isAgent ? 'border-primary-foreground/25' : 'border-border'}`}
        >
          {render(quote)}
        </div>
      )}
    </>
  );
}
