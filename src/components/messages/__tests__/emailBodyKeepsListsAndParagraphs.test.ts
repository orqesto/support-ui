/**
 * A reply sent with paragraphs and a numbered list showed in the thread as bare lines (prod
 * 2026-10-20): Tailwind's reset zeroes paragraph margins and removes list markers, and
 * `.email-body` did not put them back. The email itself kept its HTML. jsdom loads no stylesheet,
 * so this pins the rules in the stylesheet the bubble uses.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');

const ruleFor = (selector: string) => {
  const match = new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[2] : '';
};

describe('.email-body keeps an email’s structure', () => {
  it('paragraphs keep a gap between them', () => {
    expect(ruleFor('.email-body p')).toMatch(/margin:\s*0 0 [\d.]+em/);
  });

  it('numbered and bulleted lists keep their markers and indent', () => {
    expect(ruleFor('.email-body ol')).toMatch(/list-style:\s*decimal/);
    expect(ruleFor('.email-body ul')).toMatch(/list-style:\s*disc/);
    expect(ruleFor('.email-body ol')).toMatch(/padding-left:/);
  });

  it('CONTROL: the lookup finds a rule that was already there', () => {
    expect(ruleFor('.email-body pre')).toMatch(/white-space:\s*pre-wrap/);
  });
});
