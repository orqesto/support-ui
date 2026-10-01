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
 * How much of a body a ONE-LINE preview strips. A spam-log card now carries its full stored body
 * (up to 262,144 characters) for its dialog; running the tag/entity regexes over all of it for a
 * line that shows a few dozen characters was wasted work on every render. 2,000 source characters
 * is far more than any one-line preview shows, even through heavy markup.
 */
export const PREVIEW_SOURCE_MAX = 2000;

/**
 * The plain-text one-line preview of a body: only its first PREVIEW_SOURCE_MAX characters are
 * stripped. When — and only when — that slice actually CUT the body, the cut can land inside a
 * tag (`<td style="…`) or an entity (`&nbs`), and that unclosed tail is dropped so it never shows
 * as text. Only a real tag start (`<` + letter, `/` or `!`) and a real entity shape count, so a
 * body that was not cut keeps text such as "AT&T", "R&D", "<3" or "3 < 5" exactly.
 */
export const previewText = (body: string | null | undefined): string => {
  const source = body ?? '';
  if (source.length <= PREVIEW_SOURCE_MAX) return stripHtml(source);
  return stripHtml(
    source
      .slice(0, PREVIEW_SOURCE_MAX)
      .replace(/<[a-zA-Z/!][^>]*$/, '')
      .replace(/&(#\d*|#x[0-9a-f]*|[a-z]+)$/i, '')
  );
};

/**
 * True when a rich-text body carries no visible text — empty, whitespace, or
 * markup-only (`<p></p>`, `<p><br></p>`, an `<img>` with no text). Used to block
 * text-less sends even when attachments are present. Mirrors the backend
 * `isBlankHtml` guard so the UI and API agree.
 */
export const isBlankRichText = (html: string): boolean => stripHtml(html).length === 0;
