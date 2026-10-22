import { highlightMarkClasses } from './highlight.styles';
import type { HighlightProps } from './highlight.types';
import { splitByTerms } from '@/lib/highlightTerms';
import { cn } from '@/lib/utils';

/**
 * Text with the typed search terms marked. Renders text nodes and `<mark>` only — never HTML from
 * the data — so a body that says `<script>` shows those characters.
 */
export const Highlight = ({ text, terms, mode, className, markClassName }: HighlightProps) => {
  const parts = splitByTerms(text, terms, mode);
  if (!parts.some((part) => part.match)) return <>{text}</>;
  return (
    <span className={className}>
      {parts.map((part) =>
        part.match ? (
          <mark key={part.start} className={cn(highlightMarkClasses, markClassName)}>
            {part.text}
          </mark>
        ) : (
          <span key={part.start}>{part.text}</span>
        )
      )}
    </span>
  );
};
