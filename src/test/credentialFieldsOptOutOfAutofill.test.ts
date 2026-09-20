import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 A CREDENTIAL FIELD THE BROWSER WILL FILL FOR YOU.
 *
 * Observed on staging 2026-09-20: the custom-API connect dialog paired a "Header name" text input
 * with a `type="password"` input, and Chrome read the pair as a login form — autofilling the
 * signed-in admin's OWN email address and saved account password. The key is masked, so it looks
 * like a key somebody typed. Pressing Connect would have encrypted that password as a vendor
 * credential, SENT IT TO A THIRD PARTY on every lookup, and named the auth header after their
 * email address.
 *
 * ⛔ `autoComplete="off"` DOES NOT STOP IT. That field already had `off`; Chrome honours `off`
 * only for non-credential fields and fills a password input regardless. `new-password` is the
 * value that actually suppresses saved-password fill.
 *
 * ⛔ WHY A CLASS GUARD AND NOT JUST THE FIX. Every other secret field in this app was already
 * safe — `PasswordInput` defaults to `new-password` and `SecretField` sets it explicitly — so the
 * provider, SSO, database, object-storage and Confluence keys were never exposed. The custom-API
 * form was the single place that reached past the shared components for a raw `Input`, and that is
 * exactly how the next one will happen too. The lesson this repo keeps relearning is to enumerate
 * the class rather than fix the file.
 *
 * ⚠️ WHAT THIS CANNOT PROVE. It asserts the ATTRIBUTE. Only a browser proves the browser stopped —
 * which was done for the original fix against the deployed page, and is the standing requirement
 * for any new one. A token present in the source is not a behaviour observed.
 */

const SRC = join(process.cwd(), 'src');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

describe('every password field opts out of saved-password autofill', () => {
  it('⛔ any file with type="password" also sets autoComplete="new-password"', () => {
    const offenders = sourceFiles(SRC)
      .map((path) => ({ path, text: readFileSync(path, 'utf8') }))
      .filter(({ text }) => /type=["']password["']/.test(text))
      /**
       * ⚠️ TWO WRONG VERSIONS BEFORE THIS ONE, in opposite directions, and each looked right:
       *  1. `autoComplete="new-password"` only — called the shared `PasswordInput` an offender,
       *     because it sets the value as a DEFAULT PARAMETER (`autoComplete = 'new-password'`).
       *     That component is what protects every other secret field in the app.
       *  2. bare `new-password` anywhere — went green against the shipped defect restored, because
       *     the file's own COMMENT explains the word. The negative control passed while the code
       *     was broken, which is the failure mode this project has written down twice.
       * So: the value must sit on an `autoComplete`, as an attribute or as a default.
       */
      .filter(({ text }) => !/autoComplete\s*[=:]\s*["']new-password["']/.test(text))
      .map(({ path }) => path.replace(`${SRC}/`, ''));

    // RED: revert the custom-API key field to `autoComplete="off"` — the value it shipped with —
    // and this names the file. It also catches the next raw password input added anywhere.
    expect(offenders).toEqual([]);
  });

  it('the scan actually reaches the files it claims to', () => {
    // ⛔ POSITIVE CONTROL. An empty offender list means nothing if the walk found no files, and a
    // silent zero is how a guard like this rots into decoration. Prove it sees the known ones.
    const withPasswordFields = sourceFiles(SRC).filter((path) =>
      /type=["']password["']/.test(readFileSync(path, 'utf8'))
    );

    expect(withPasswordFields.length).toBeGreaterThan(0);
    expect(withPasswordFields.some((path) => path.includes('CustomApiVendorForm'))).toBe(true);
  });
});
