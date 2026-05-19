import { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import DOMPurify from 'dompurify';
import { THREAD_SANITIZE, renderMarkdown, splitAtQuote } from './messageDetailConstants';

export function ThreadBubble({ content, isAgent }: { content: string; isAgent: boolean }) {
  const [showQuote, setShowQuote] = useState(false);
  const isHtml = /<[a-z][\s\S]*>/i.test(content);
  const { main, quote } = useMemo(() => splitAtQuote(content, isHtml), [content, isHtml]);

  const prose = isAgent
    ? 'prose prose-sm prose-invert dark:prose-invert max-w-none'
    : 'prose prose-sm max-w-none';

  const renderHtml = (html: string) => (
    <div
      className={prose}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, THREAD_SANITIZE) }}
    />
  );
  const renderText = (text: string) => (
    <div className={prose} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
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
