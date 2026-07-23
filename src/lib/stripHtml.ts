/**
 * Strip HTML tags from text content
 */
export const stripHtml = (html: string): string => {
  if (!html) return '';
  
  return html
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
};

/**
 * True when a rich-text body carries no visible text — empty, whitespace, or
 * markup-only (`<p></p>`, `<p><br></p>`, an `<img>` with no text). Used to block
 * text-less sends even when attachments are present. Mirrors the backend
 * `isBlankHtml` guard so the UI and API agree.
 */
export const isBlankRichText = (html: string): boolean => stripHtml(html).length === 0;
