/**
 * Strip HTML tags for a plain-text preview.
 *
 * Tags collapse to a SPACE, not to nothing: rich-text bodies are made of block
 * elements, so deleting the tags outright fused the last word of one paragraph
 * onto the first of the next ("…your message.We can confirm…"). The final
 * whitespace collapse puts that back to single spaces, which is what a
 * single-line preview wants anyway.
 *
 * Entities are decoded before the collapse so `&nbsp;` runs don't survive it.
 */
export const stripHtml = (html: string): string => {
  if (!html) return '';

  return html
    .replace(/<[^>]*>/g, ' ') // Tags → space, so block boundaries stay word boundaries
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ') // Collapse the separators (and any source formatting)
    .trim();
};

/**
 * True when a rich-text body carries no visible text — empty, whitespace, or
 * markup-only (`<p></p>`, `<p><br></p>`, an `<img>` with no text). Used to block
 * text-less sends even when attachments are present. Mirrors the backend
 * `isBlankHtml` guard so the UI and API agree.
 */
export const isBlankRichText = (html: string): boolean => stripHtml(html).length === 0;
