import { ExternalLink } from 'lucide-react';

/**
 * Detects URLs in text and converts them to clickable links
 * Supports http, https, and www URLs
 */
export const linkifyText = (text: string): React.ReactNode => {
  // URL regex pattern - matches http://, https://, and www. URLs
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

  const parts = text.split(urlPattern);

  return parts.map((part, index) => {
    // Check if this part is a URL
    if (part.match(urlPattern)) {
      let href = part;

      // Add https:// if it starts with www.
      if (part.startsWith('www.')) {
        href = `https://${part}`;
      }

      // Truncate very long URLs for display
      const displayText = part.length > 60 ? `${part.substring(0, 60)}...` : part;

      return (
        // Index key is safe: array is immutable (recreated from text split), no reordering
        // eslint-disable-next-line react/no-array-index-key
        <a key={`link-${index}-${part.substring(0, 20)}`} href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex gap-1 items-center text-blue-600 underline break-all transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 decoration-blue-600/30 hover:decoration-blue-600 dark:decoration-blue-400/30 dark:hover:decoration-blue-400"
          title={part} // Full URL on hover
        >
          {displayText}
          <ExternalLink className="inline w-3 h-3 shrink-0" />
        </a>
      );
    }

    // Regular text - preserve line breaks
    // Index key is safe: array is immutable (recreated from text split), no reordering
    // eslint-disable-next-line react/no-array-index-key
    return <span key={`text-${index}-${part.substring(0, 20)}`}>{part}</span>;
  });
};

/**
 * Component wrapper for linkified text
 */
export const LinkifiedText = ({ children }: { children: string }) => <>{linkifyText(children)}</>;
