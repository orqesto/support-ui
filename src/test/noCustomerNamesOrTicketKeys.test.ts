import { createHash } from 'crypto';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * No customer names and no real ticket keys in the repo's sources and docs — comments included.
 *
 * This repository is public. On 2026-11-16 it still carried a customer deployment's code name in
 * nine files, a workspace's real id and size in a fixture, and ticket keys from customer workspaces
 * in comments ("after <code name> <PREFIX>-SUP-6093 drafted…"). Sessions copy these from backend
 * work and incident notes, where they are fine.
 *
 * Two checks, both safe to publish:
 * 1. Ticket keys (`ABC-SUP-12`): an ALLOWLIST of invented workspace prefixes. Any other prefix
 *    fails, so a new customer is caught without anyone adding it here. Fix: use `ABC-SUP-1`.
 * 2. Customer and deployment names: compared as SHA-256 hashes of single words, so this file does
 *    not publish the names it bans. Words are split on non-letters and on camelCase (`fooGap` →
 *    `foo`, `gap`). Fix: write "a customer's deployment" or use a fictional brand.
 *
 * Adding a prefix to ALLOWED_KEY_PREFIXES is a review decision: it must be invented, never a real
 * workspace's code.
 */

/** Invented workspace codes used in fixtures (fictional brands, test and demo workspaces). */
const ALLOWED_KEY_PREFIXES = new Set([
  'ABC',
  'ACM',
  'ACME',
  'ADM',
  'ALL',
  'BRI',
  'BUILD',
  'COR',
  'CTL', // docs/FE_OVERVIEW.md item ids (CTL-LOW-01), not ticket keys
  'EX',
  'KAN',
  'MIL',
  'NORD',
  'ODL',
  'PAGE',
  'TES',
  'TRA',
  'XYZ',
  'ZET',
  'ZZZ',
]);

/** SHA-256 of lower-cased customer and deployment names. Never add the plain word. */
const BANNED_WORD_HASHES = new Set([
  '07c05679b1cfed895de0d8383a02cafb7a040d5db41878fa2c47103fe7aba541',
  '3c817862428bd60a484bea34c8eb711c39716c94d307846824123124b6417fb9',
  'b3c8817328d488c95fe6c8f91041457097c6278411812fbcd2be8d38c11fb5ba',
  'd5a4d2065914b7f9b8ccc110eb758357ec208ce220e13e63ecc4bd52da0230c0',
  'f78bd817be9704d87ea69a412a468cc151f79cbb69ed0932fe9d974779163391',
  'f825217b1f3eccfafda908b77f815ff0479dd4b3cb7adb22264163e0dab2d739',
]);

const TICKET_KEY = /\b([A-Z]{2,5})-[A-Z]{2,4}-\d+\b/g;

const THIS_FILE = join('src', 'test', 'noCustomerNamesOrTicketKeys.test.ts');

const allFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return allFiles(path);
    return /\.(tsx?|jsx?|mjs|cjs|json|html|md|txt|ya?ml|css)$/.test(name) ? [path] : [];
  });

const hashCache = new Map<string, boolean>();
const isBannedWord = (word: string): boolean => {
  const cached = hashCache.get(word);
  if (cached !== undefined) return cached;
  const banned = BANNED_WORD_HASHES.has(createHash('sha256').update(word).digest('hex'));
  hashCache.set(word, banned);
  return banned;
};

/** Lower-cased words: split on anything that is not a letter, then on camelCase boundaries. */
const wordsOf = (text: string): string[] =>
  text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .filter((word) => word.length >= 3)
    .map((word) => word.toLowerCase());

export const customerTraces = (text: string): string[] => [
  ...[...text.matchAll(TICKET_KEY)]
    .filter((match) => !ALLOWED_KEY_PREFIXES.has(match[1]))
    .map((match) => `ticket key ${match[0]}`),
  ...[...new Set(wordsOf(text))].filter(isBannedWord).map(() => 'a banned customer name'),
];

describe('no customer names or real ticket keys in the public repo', () => {
  it('flags an unknown ticket prefix and lets invented ones through', () => {
    expect(customerTraces('see QQQ-SUP-42')).toEqual(['ticket key QQQ-SUP-42']);
    expect(customerTraces('ABC-SUP-1, TES-INF-2, ACME-KB-3 and T-21')).toEqual([]);
  });

  it('matches banned words by hash, also inside camelCase, and ignores ordinary words', () => {
    // The control word is built so its plain spelling never appears in this file.
    const control = ['ta', 'co'].join('');
    expect(customerTraces(`on ${control}, 2026-10-27`)).toEqual(['a banned customer name']);
    expect(customerTraces(`const ${control}Gap = {}`)).toEqual(['a banned customer name']);
    expect(customerTraces('const largeGap = { name: "Example Corp" }')).toEqual([]);
  });

  it('finds none in src, docs, public or scripts', () => {
    const offenders = ['src', 'docs', 'public', 'scripts']
      .flatMap((root) => allFiles(root))
      .filter((file) => file !== THIS_FILE)
      .flatMap((file) =>
        customerTraces(readFileSync(file, 'utf8')).map((trace) => `${file}: ${trace}`)
      );
    expect(offenders).toEqual([]);
  });
});
