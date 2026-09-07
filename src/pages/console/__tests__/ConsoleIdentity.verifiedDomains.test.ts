/**
 * A domain can be PROVEN and still not be on the allowed list.
 *
 * The two do different jobs and the page said otherwise: the field's help text claimed
 * these domains "are routed to SSO", which is the verified domains' job. This list gates
 * one thing only — creating an account for someone who does not exist yet. An existing
 * member signs in whatever their domain, and SCIM provisioning never reads it. The wrong
 * copy sent us looking for a domain rule as the reason IdP-named users were not created
 * (2026-09-07); the real cause was elsewhere entirely.
 *
 * They stay separate on purpose: verifying ownership must not silently widen who may be
 * auto-created and consume seats. So the page surfaces the gap and offers to close it,
 * rather than closing it behind the admin's back.
 *
 * Source tripwire — the rendering is covered by the page's own suite; what this pins is
 * the claim the copy makes and the fact that the gap is computed at all.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../ConsoleIdentity.tsx'),
  'utf8'
);

describe('ConsoleIdentity — allowed email domains', () => {
  it('does not claim the allowed list routes anyone to SSO', () => {
    // Narrow on purpose: a separate, CORRECT sentence on this page says that without a
    // verified domain "no users are routed to SSO" — that one is about verified domains,
    // which really do decide routing. Only the claim made about THIS field is wrong.
    expect(source).not.toMatch(/Users with these email domains are routed to SSO/);
  });

  it('says what the list actually gates, and that SCIM ignores it', () => {
    expect(source).toMatch(/created\s*\n?\s*automatically on first SSO sign-in/);
    expect(source).toMatch(/SCIM provisioning ignores this list/);
  });

  it('computes verified domains that are absent from the allowed list', () => {
    expect(source).toMatch(/verifiedNotAllowed/);
    // Compared case-insensitively: a domain is the same domain whatever its casing, and
    // an admin typing "Example.com" must not produce a phantom "missing" row.
    expect(source).toMatch(/toLowerCase\(\)/);
    // Only VERIFIED domains qualify — an unverified one is not proven and must not be
    // offered as safe to add.
    expect(source).toMatch(/verifiedAt !== null/);
  });

  it('adds to the field rather than saving behind the admin', () => {
    // Widening who can be auto-created is a decision. The button stages it; the existing
    // Save applies it, which is also what the copy promises.
    expect(source).toMatch(/setDomainsText\(/);
    expect(source).toMatch(/takes effect when you save/);
  });
});
