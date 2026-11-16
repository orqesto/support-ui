import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { readFileSync, statSync } from 'fs';
import { describe, it, expect } from 'vitest';

/**
 * No customer names and no real ticket keys anywhere in the repo — sources, comments, docs,
 * scripts, workflows and root files.
 *
 * This repository is public. On 2026-11-16 it still carried a customer deployment's code name in
 * nine files, a workspace's real id, slug and size in fixtures, and ticket keys from customer
 * workspaces in comments ("after <code name> <PREFIX>-SUP-6093 drafted…"). Sessions copy these
 * from backend work and incident notes, where they are fine.
 *
 * Two checks, both safe to publish:
 * 1. Ticket keys (`ABC-SUP-12`): the workspace code must be on an ALLOWLIST of invented codes. Any
 *    other code fails, so a new customer is caught without anyone adding it here. Fix: use
 *    `ABC-SUP-1`.
 * 2. Customer and deployment names: compared as SHA-256 hashes, so this file does not publish the
 *    names it bans. Short names match as whole words (also inside camelCase and ALLCAPS
 *    identifiers: `fooGap`, `FOOGap`); long names also match inside a longer word (`fooshop`).
 *    Fix: write "a customer's deployment" or use a fictional brand.
 *
 * It scans what git tracks (`git ls-files`), which is exactly what gets published.
 * Adding a code to ALLOWED_KEY_CODES is a review decision: it must be invented, never a real
 * workspace's code.
 */

/** Invented workspace codes used in fixtures (fictional brands, test and demo workspaces). */
const ALLOWED_KEY_CODES = new Set([
  'ABC',
  'ACM',
  'ACME',
  'ADM',
  'ALL',
  'BRI',
  'BUILD',
  'COR',
  'CTL', // docs/FE_OVERVIEW.md item ids (CTL-LOW-01), not ticket keys
  'D', // plan item ids in comments (D-ADM-1), not ticket keys
  'EX',
  'KAN',
  'MIL',
  'NORD',
  'ODL',
  'P7', // plan item ids (P7-IN-06)
  'PAGE',
  'TEMPLATES', // plan id (TEMPLATES-PLAN-2026)
  'TES',
  'TRA',
  'XYZ',
  'ZET',
  'ZZZ',
]);

/** SHA-256 of lower-cased names short enough to occur inside ordinary words: whole words only. */
const BANNED_WORD_HASHES = new Set([
  '07c05679b1cfed895de0d8383a02cafb7a040d5db41878fa2c47103fe7aba541',
  'f825217b1f3eccfafda908b77f815ff0479dd4b3cb7adb22264163e0dab2d739',
]);

/** SHA-256 of lower-cased long names, also matched inside longer words. Never add the plain word. */
const BANNED_LONG_NAME_HASHES = new Set([
  '3c817862428bd60a484bea34c8eb711c39716c94d307846824123124b6417fb9',
  'b3c8817328d488c95fe6c8f91041457097c6278411812fbcd2be8d38c11fb5ba',
  'd5a4d2065914b7f9b8ccc110eb758357ec208ce220e13e63ecc4bd52da0230c0',
  'f78bd817be9704d87ea69a412a468cc151f79cbb69ed0932fe9d974779163391',
]);
/** Lengths of the long names, so only substrings of those lengths are hashed. */
const LONG_NAME_LENGTHS = [9, 10, 14];

/** A workspace code (letters, optional digits — the app's `^([A-Z]+\d*)-`) + a team code + a number. */
const TICKET_KEY = /\b([A-Z]+\d*)-[A-Z]{2,4}-\d+\b/g;

const THIS_FILE = 'src/test/noCustomerNamesOrTicketKeys.test.ts';
const SKIPPED_FILE = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|eot|pdf|zip)$|(^|\/)package-lock\.json$/;

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

const hashCache = new Map<string, boolean>();
const cached = (key: string, compute: () => boolean): boolean => {
  const known = hashCache.get(key);
  if (known !== undefined) return known;
  const result = compute();
  hashCache.set(key, result);
  return result;
};

/** Lower-cased words: split on non-letters, on camelCase, and between an ALLCAPS run and a word. */
const wordsOf = (text: string): string[] =>
  text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .filter((word) => word.length >= 3)
    .map((word) => word.toLowerCase());

/** Lower-cased letter runs, NOT split on case, for the long-name substring check. */
const lettersRunsOf = (text: string): string[] =>
  text
    .split(/[^A-Za-z]+/)
    .filter((run) => run.length >= LONG_NAME_LENGTHS[0])
    .map((run) => run.toLowerCase());

const containsLongName = (run: string): boolean =>
  cached(`long:${run}`, () =>
    LONG_NAME_LENGTHS.some((length) => {
      for (let start = 0; start + length <= run.length; start += 1) {
        if (BANNED_LONG_NAME_HASHES.has(sha256(run.slice(start, start + length)))) return true;
      }
      return false;
    })
  );

export const customerTraces = (text: string): string[] => {
  const keys = [...text.matchAll(TICKET_KEY)]
    .filter((match) => !ALLOWED_KEY_CODES.has(match[1]))
    .map((match) => `ticket key ${match[0]}`);
  const named =
    [...new Set(wordsOf(text))].some((word) =>
      cached(`word:${word}`, () => BANNED_WORD_HASHES.has(sha256(word)))
    ) || [...new Set(lettersRunsOf(text))].some(containsLongName);
  return named ? [...keys, 'a banned customer name'] : keys;
};

const trackedFiles = (): string[] =>
  execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((file) => file && file !== THIS_FILE && !SKIPPED_FILE.test(file))
    // The index can list what is not a readable file on disk: a deletion not yet staged, a submodule.
    .filter((file) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    });

describe('no customer names or real ticket keys in the public repo', () => {
  it('flags an unknown workspace code and lets invented ones through', () => {
    expect(customerTraces('see QQQ-SUP-42')).toEqual(['ticket key QQQ-SUP-42']);
    expect(customerTraces('see G2-SUP-5')).toEqual(['ticket key G2-SUP-5']);
    expect(customerTraces('ABC-SUP-1, TES-INF-2, ACME-KB-3, T-21, ISO-8601')).toEqual([]);
  });

  it('matches banned names by hash in words, camelCase and ALLCAPS, and ignores ordinary words', () => {
    // Control words are built so their plain spelling never appears in this file.
    const short = ['ta', 'co'].join('');
    expect(customerTraces(`on ${short}, 2026-10-27`)).toEqual(['a banned customer name']);
    expect(customerTraces(`const ${short}Gap = {}`)).toEqual(['a banned customer name']);
    expect(customerTraces(`const ${short.toUpperCase()}Gap = {}`)).toEqual([
      'a banned customer name',
    ]);
    const long = ['frame', 'house'].join('');
    expect(customerTraces(`https://${long}shop.example`)).toEqual(['a banned customer name']);
    expect(customerTraces('const largeGap = { name: "Example Corp" }; adaptable')).toEqual([]);
  });

  it('finds none in any file git tracks', () => {
    const offenders = trackedFiles().flatMap((file) =>
      customerTraces(readFileSync(file, 'utf8')).map((trace) => `${file}: ${trace}`)
    );
    expect(offenders).toEqual([]);
  }, 60_000);
});
