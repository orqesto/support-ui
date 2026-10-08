import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * Every email address in the repo's sources and docs — fixtures, comments, copy — is on an
 * INVENTED domain.
 *
 * This repository is public (and mirrored). In 2026-10 it was found to carry real customers'
 * domains, a named person's address and phone number, and a customer's internal knowledge-base
 * note, all copied from production into tests and comments. A list of banned names cannot guard
 * that: it would publish the names it bans, and it misses every customer nobody thought to add.
 * So this is an ALLOWLIST. An address on any other domain fails, and the fix is to invent one —
 * `*.example`, `*.test`, `example.com`, or a fictional brand already listed below — never to add
 * a real customer's domain to the list.
 *
 * Adding a domain here is a review decision: it must be fictional, or a public provider used as a
 * provider (gmail.com, shopify.com), never a domain a customer of ours sends mail from.
 */

/** Reserved for documentation and testing (RFC 2606 / RFC 6761), plus local-only names. */
const RESERVED = /(^|\.)(example|test|invalid|local|localhost)$|(^|\.)example\.(com|net|org)$/;

const ALLOWED = new Set([
  // Public providers and platforms, used as providers.
  'gmail.com',
  'hotmail.com',
  'yahoo.co.uk',
  'inbox.lv',
  'shopify.com',
  'linkedin.com',
  'm.ngrok.com',
  'odly.ai',
  // Placeholders.
  'acme.com',
  'acme.io',
  'acme.tset',
  'b.c',
  'b.co',
  'b.com',
  'client.com',
  'company.com',
  'customer.com',
  'ex.com',
  'mail.sub.example.museum',
  'old.io',
  'other.com',
  'us.io',
  'vendor.com',
  'x.com',
  'x.info',
  'x.io',
  'x.net',
  'x.y',
  'y.z',
  'shop.com',
  'shop.de',
  'shop.es',
  'shop.eu',
  'shop.info',
  'shop.pl',
  'shop.se',
  // Fictional brands.
  'dynalar.com',
  'kangtao.eu',
  'lowtide.fund',
  'deals.lowtide.fund',
  'militech.com',
  'militech.info',
  'militech.org',
  'petrochem.info',
  'petronet.info',
  'segatari.lv',
  'traumateam.co.uk',
  'traumateam.de',
  'traumateam.info',
  'traumateam.pl',
]);

const ADDRESS = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

/**
 * Hosts a URL may name: vendors we integrate with, our own, and standards bodies. A pasted email
 * signature leaks its sender through an image URL as surely as through an address.
 */
const ALLOWED_HOSTS = new Set([
  'odly.ai',
  'app.odly.ai',
  'staging.odly.ai',
  'www.w3.org',
  'fonts.googleapis.com',
  't.me',
  'accounts.google.com',
  'login.microsoftonline.com',
  'docs.aws.amazon.com',
  'api.slack.com',
  'api.openai.com',
  'api.anthropic.com',
  'api.deepseek.com',
  'api.perplexity.ai',
  'openrouter.ai',
  'dashscope-intl.aliyuncs.com',
  'fsn1.your-objectstorage.com',
  'your-domain.atlassian.net',
  'acme.atlassian.net',
  'ollama.internal',
]);

const URL_HOST = /https?:\/\/([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

const THIS_FILE = join('src', 'test', 'fixturesUseInventedAddresses.test.ts');

/** Every file under `dir`, tests included — fixtures are exactly where the data was. */
const allFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return allFiles(path);
    return /\.(tsx?|jsx?|mjs|cjs|json|html|md|txt|ya?ml)$/.test(name) ? [path] : [];
  });

export const foreignAddresses = (text: string): string[] => [
  ...[...text.matchAll(ADDRESS)]
    .map((match) => match[1].toLowerCase())
    .filter((domain) => !RESERVED.test(domain) && !ALLOWED.has(domain)),
  ...[...text.matchAll(URL_HOST)]
    .map((match) => match[1].toLowerCase())
    .filter(
      (host) => !RESERVED.test(host) && !ALLOWED_HOSTS.has(host) && !/^\d+(\.\d+){3}$/.test(host)
    ),
];

describe('fixtures and comments use invented addresses and hosts', () => {
  it('finds a real-looking domain and lets reserved and listed ones through', () => {
    expect(foreignAddresses("email: 'jane@realcustomer.lv'")).toEqual(['realcustomer.lv']);
    expect(foreignAddresses('<img src="https://cdn.realcustomer.lv/logo.png">')).toEqual([
      'cdn.realcustomer.lv',
    ]);
    expect(
      foreignAddresses('a@x.example b@y.test c@example.com d@militech.org e@gmail.com')
    ).toEqual([]);
    expect(
      foreignAddresses('https://api.openai.com/v1 https://cdn.shop.test/x http://192.168.1.10')
    ).toEqual([]);
  });

  it('has no address or URL host outside the allowlists', () => {
    const offenders = ['src', 'docs', 'public', 'scripts']
      .flatMap((root) => allFiles(root))
      .filter((file) => file !== THIS_FILE)
      .flatMap((file) =>
        foreignAddresses(readFileSync(file, 'utf8')).map((domain) => `${file}: @${domain}`)
      );
    expect(offenders).toEqual([]);
  });
});
