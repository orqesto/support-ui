/**
 * A reply sent with paragraphs and a numbered list showed in the thread as bare lines (prod
 * 2026-10-20): Tailwind's reset zeroes paragraph margins and removes list markers, and
 * `.email-body` did not put them back. The email itself kept its HTML. jsdom loads no stylesheet,
 * so this pins the rules in the stylesheet the bubble uses — including what the review of that fix
 * found it broke: Outlook's one-<p>-per-line mail double-spaced, a sender's lettered list
 * renumbered, a gap under every message.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');

/** The declarations of the rule whose selector list is exactly `selector`. */
const ruleFor = (selector: string) => {
  // Not the tail of a longer selector list (`.a,\n.b {` is not the rule for `.b`).
  let start = css.indexOf(`\n${selector} {`);
  while (start > 0 && css[start - 1] === ',') start = css.indexOf(`\n${selector} {`, start + 1);
  if (start < 0) return '';
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
};

describe('.email-body keeps an email’s structure', () => {
  it('paragraphs keep a gap — except Outlook’s one-paragraph-per-line MsoNormal', () => {
    expect(ruleFor(".email-body p:not([class*='Mso'])")).toMatch(/margin:\s*0 0 [\d.]+em/);
    expect(ruleFor('.email-body p')).toBe('');
  });

  it('lists keep markers and an indent on the reading-start side', () => {
    expect(ruleFor('.email-body ol')).toMatch(/list-style-type:\s*decimal/);
    expect(ruleFor('.email-body ul')).toMatch(/list-style-type:\s*disc/);
    expect(ruleFor('.email-body ul ul')).toMatch(/list-style-type:\s*circle/);
    expect(ruleFor('.email-body ol,\n.email-body ul')).toMatch(/padding-inline-start:/);
  });

  it('no gap between list items of our own editor, and none under the last block', () => {
    // As specific as the paragraph rule (`:not([class*='Mso'])`), or the paragraph gap wins.
    expect(ruleFor(".email-body li > p:not([class*='Mso'])")).toMatch(/margin:\s*0;/);
    expect(ruleFor('.email-body :is(p, ol, ul):last-child')).toMatch(/margin-bottom:\s*0/);
  });

  it('CONTROL: the lookup finds a rule that was already there', () => {
    expect(ruleFor('.email-body pre')).toMatch(/white-space:\s*pre-wrap/);
  });
});
