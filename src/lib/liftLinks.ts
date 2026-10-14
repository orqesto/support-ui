/**
 * Links in text that is about to be escaped and run through markdown-ish rules — ONE helper for
 * the AI-draft converter, the plain-text mail renderer and Translate (review of #594: three URL
 * regexes linked the same URL three ways, and each broke differently).
 *
 * Links are LIFTED out of the raw text into tokens first and put back as <a> last, so no later
 * rule can reach into a URL: an underscore URL lost its underscores to <em>, `<https://…>`
 * carried "&gt;" into the href, `**url**` carried "**". A URL stops at whitespace, quotes,
 * angle/square brackets, `*` and a backtick, and drops sentence punctuation at its end.
 */
const BARE_URL = /https?:\/\/[^\s<>"'`*[\]]*[^\s<>"'`*[\].,;:!?)_]/g;
const MARKDOWN_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s"'<>)]+)\)/g;
const TOKEN = /(\d+)/g;

const escapeAttr = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type LiftedLinks = {
  /** The text with each link replaced by a token no escaping or markdown rule touches. */
  text: string;
  /** Puts the links back as <a> into the processed HTML. */
  restore: (html: string) => string;
};

export const liftLinks = (
  raw: string,
  { markdown = false, attrs = '' }: { markdown?: boolean; attrs?: string } = {}
): LiftedLinks => {
  const tokens: string[] = [];
  const token = (html: string): string => `${tokens.push(html) - 1}`;
  let text = raw;
  if (markdown) {
    // The label stays in the text, between an opening and a closing token, so its own emphasis
    // (`[**the guide**](…)`) is still converted.
    text = text.replace(MARKDOWN_LINK, (_match, label: string, url: string) =>
      // A label that is itself a URL (`[https://x](https://x)`) is lifted whole: left in the text,
      // the bare-URL rule linked it again inside the link (review of #597).
      /https?:\/\//i.test(label)
        ? token(`<a href="${escapeAttr(url)}"${attrs}>${escapeAttr(label)}</a>`)
        : `${token(`<a href="${escapeAttr(url)}"${attrs}>`)}${label}${token('</a>')}`
    );
  }
  text = text.replace(BARE_URL, (url) =>
    token(`<a href="${escapeAttr(url)}"${attrs}>${escapeAttr(url)}</a>`)
  );
  return {
    text,
    restore: (html) => html.replace(TOKEN, (_match, index: string) => tokens[Number(index)] ?? ''),
  };
};
