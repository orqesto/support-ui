/**
 * Links in text that is about to be escaped and run through markdown-ish rules — ONE helper for
 * the AI-draft converter, the plain-text mail renderer and Translate (review of #594: three URL
 * regexes linked the same URL three ways, and each broke differently).
 *
 * Links are LIFTED out of the raw text into tokens first and put back as <a> last, so no later
 * rule can reach into a URL: an underscore URL lost its underscores to <em>, `<https://…>`
 * carried "&gt;" into the href, `**url**` carried "**". A URL stops at whitespace, quotes,
 * angle/square brackets, `*` and a backtick, and drops sentence punctuation at its end. A
 * closing `)` at the end is dropped only while it has no partner inside the URL: prose parens
 * `(see https://x.example/a)` lose it, `https://wiki.example/wiki/Foo_(bar)` keeps it
 * (review of #597). A trailing `_` stays (`…/reset_`) unless an `_` emphasis is open on the line
 * before the URL — `_see https://x.example/a_` / `_(https://x.example/a)_`: then that `_` closes
 * the emphasis, not the URL (the emphasis rules pair `_`s left to right on a line, so "open" =
 * an odd count; GFM drops every trailing `_`, which broke `…/reset_` links). A markdown link's
 * URL may hold one level of balanced parens: `[t](https://x.example/a_(b))`. Linear: one count,
 * one backwards trim, one running underscore count per line.
 */
// A run that may be a URL; its end is trimmed by urlEnd. The sentinel is never part of one.
const URL_RUN = /https?:\/\/[^\s<>"'`*[\]\uE000]+/g;
const MARKDOWN_LINK =
  /\[([^\]\n]+)\]\((https?:\/\/(?:[^\s"'<>()\uE000]|\([^\s"'<>()\uE000]*\))+)\)/g;
const TOKEN = /(\d+)/g;

/**
 * Where the URL in `run` ends: trailing punctuation, unpartnered `)` and — while `emphasisOpen` —
 * one `_` are left as text, in any order (`a)_`, `a_).`).
 */
const urlEnd = (run: string, emphasisOpen: boolean): number => {
  let underscores = emphasisOpen ? 1 : 0;
  let open = 0;
  let close = 0;
  for (const char of run) {
    if (char === '(') open++;
    else if (char === ')') close++;
  }
  let end = run.length;
  while (end > 0) {
    const char = run[end - 1];
    if ('.,;:!?'.includes(char)) end--;
    else if (char === ')' && close > open) {
      close--;
      end--;
    } else if (char === '_' && underscores > 0) {
      underscores--;
      end--;
    } else break;
  }
  return end;
};

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
  // A sentinel already in the source is lifted first, as a token of its own: left in place,
  // restore() read `\uE000N\uE000` typed into the text as a token and printed link N there
  // (review of #597). Every sentinel left in the text now belongs to one of our tokens.
  let text = raw.replace(/\uE000/g, () => token('\uE000'));
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
  // `_`s on the current line before this URL (not inside an earlier URL), counted as we go.
  let counted = 0;
  let underscores = 0;
  text = text.replace(URL_RUN, (run, offset: number, whole: string) => {
    for (; counted < offset; counted++) {
      if (whole[counted] === '\n') underscores = 0;
      else if (whole[counted] === '_') underscores++;
    }
    const end = urlEnd(run, underscores % 2 === 1);
    const url = run.slice(0, end);
    if (!/^https?:\/\/./i.test(url)) return run;
    counted = offset + end; // what follows the URL (a trimmed `_` too) is counted next time
    return token(`<a href="${escapeAttr(url)}"${attrs}>${escapeAttr(url)}</a>`) + run.slice(end);
  });
  return {
    text,
    restore: (html) => html.replace(TOKEN, (_match, index: string) => tokens[Number(index)] ?? ''),
  };
};
