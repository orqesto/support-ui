import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';
import {
  CSS_ALLOWED_PROPERTIES,
  CSS_REJECTED_PROPERTIES,
  filterDeclarations,
  normalizeCssText,
  prefixClasses,
  rewriteCssUrls,
  splitDeclarations,
} from '../emailCss';
import { EMAIL_ALLOWED_ATTR, sanitizeEmailHtml, imageProxyBase } from '../emailHtml';

const CONTEXT = { eventId: 5690, apiBaseUrl: 'https://api.test', organizationId: 21 };
const PROXY = imageProxyBase(CONTEXT);
const render = (html: string) => sanitizeEmailHtml(html, CONTEXT);

describe('splitDeclarations', () => {
  it('does not split on a semicolon inside url() or quotes', () => {
    // 🪤 A plain split(';') cuts `url(data:image/png;base64,…)` in half and the guards then
    // inspect fragments instead of declarations.
    expect(splitDeclarations('background-image:url(data:image/png;base64,AAA); color:red')).toEqual(
      ['background-image:url(data:image/png;base64,AAA)', 'color:red']
    );
    expect(splitDeclarations('font-family:"Foo;Bar", serif; color:red')).toEqual([
      'font-family:"Foo;Bar", serif',
      'color:red',
    ]);
  });
});

describe('normalizeCssText', () => {
  it('resolves escapes and strips comments before any keyword test runs', () => {
    expect(normalizeCssText('u\\72 l(x)')).toBe('url(x)');
    expect(normalizeCssText('exp/*x*/ression(1)')).toBe('expression(1)');
  });
});

describe('the CSS property allowlist', () => {
  it('keeps every allowlisted property and drops every rejected one', () => {
    for (const property of CSS_ALLOWED_PROPERTIES) {
      // `display` is value-restricted and tested separately; every other property takes a
      // neutral value here purely to prove the NAME survives the filter.
      const value = property === 'display' ? 'block' : '1px';
      const out = filterDeclarations(`${property}: ${value}`, PROXY);
      expect(out, `allowlisted property "${property}" was dropped`).toContain(property);
    }
    for (const property of CSS_REJECTED_PROPERTIES.keys()) {
      const out = filterDeclarations(`${property}: 1px`, PROXY);
      expect(out, `rejected property "${property}" survived`).toBe('');
    }
  });

  it('leaves no property undecided — every rejected name is absent from the allowlist', () => {
    // Without this, adding a property to the allowlist that is ALSO documented as rejected
    // would be a silent contradiction resolved in favour of whichever list was read first.
    for (const property of CSS_REJECTED_PROPERTIES.keys()) {
      expect(CSS_ALLOWED_PROPERTIES.has(property), `"${property}" is in both lists`).toBe(false);
    }
  });

  it('drops an unknown property rather than letting it through', () => {
    expect(filterDeclarations('-webkit-something: 1px', PROXY)).toBe('');
    expect(filterDeclarations('container-type: inline-size', PROXY)).toBe('');
  });

  it('restricts display to values email actually uses', () => {
    expect(filterDeclarations('display: table-cell', PROXY)).toBe('display: table-cell');
    expect(filterDeclarations('display: none', PROXY)).toBe('display: none');
    expect(filterDeclarations('display: flex', PROXY)).toBe('');
    expect(filterDeclarations('display: grid', PROXY)).toBe('');
  });

  it('strips !important so a sender cannot outrank our container', () => {
    expect(filterDeclarations('color: red !important', PROXY)).toBe('color: red');
  });
});

describe('hostile values', () => {
  it('dies even when the property itself is allowlisted', () => {
    for (const value of [
      'expression(alert(1))',
      'e\\78 pression(alert(1))',
      'url(javascript:alert(1))',
      'url(vbscript:alert(1))',
      'url(data:text/html,<script>alert(1)</script>)',
    ]) {
      expect(filterDeclarations(`width: ${value}`, PROXY), value).toBe('');
    }
    // Filtering is PER DECLARATION, as Gmail's is: a hostile neighbour does not take the
    // sender's legitimate styling down with it. `behavior` and `-moz-binding` are absent from
    // the allowlist, so they never reach the hostile-value test at all.
    expect(filterDeclarations('color: red; behavior: url(x.htc)', PROXY)).toBe('color: red');
    expect(filterDeclarations('color: red; -moz-binding: url(x.xml)', PROXY)).toBe('color: red');
  });
});

describe('css url() is rewritten, never passed through', () => {
  it('sends a remote background through the image proxy', () => {
    const out = filterDeclarations('background-image: url(https://sender.test/px.gif)', PROXY);
    expect(out).toContain(`${PROXY}?src=`);
    expect(out).toContain(encodeURIComponent('https://sender.test/px.gif'));
    expect(out).not.toContain('sender.test/px.gif"');
  });

  it('drops the declaration when the url is not something we can serve', () => {
    // Dropping is the safe direction: a missing background is cosmetic, a passed-through one
    // is a read receipt.
    expect(rewriteCssUrls('url(/relative.png)', PROXY)).toBeNull();
    expect(rewriteCssUrls('url(data:image/png;base64,AAA)', PROXY)).toBeNull();
    expect(filterDeclarations('background-image: url(/relative.png)', PROXY)).toBe('');
  });

  it('leaves a value with no url() alone', () => {
    expect(rewriteCssUrls('#ffffff', PROXY)).toBe('#ffffff');
  });
});

describe('no sender-controlled host survives anywhere', () => {
  // One fixture carrying a remote host in EVERY vector at once. A per-vector test passes for
  // the vectors it thought of; this one fails for a vector nobody thought of.
  const HOSTILE = `
    <img src="https://evil.test/a.gif" srcset="https://evil.test/b.gif 2x">
    <td background="https://evil.test/c.gif">cell</td>
    <div style="background-image:url(https://evil.test/d.gif)">bg</div>
    <div style="list-style-image:url(https://evil.test/e.gif)">li</div>
    <div style="border-image:url(https://evil.test/f.gif)">bi</div>
    <div style="content:url(https://evil.test/g.gif)">co</div>
    <div style="cursor:url(https://evil.test/h.gif),auto">cu</div>
    <style>@font-face{src:url(https://evil.test/i.woff)}</style>
    <link rel="stylesheet" href="https://evil.test/j.css">
    <div style="behavior:url(https://evil.test/k.htc)">be</div>
  `;

  /**
   * Every URL the BROWSER would fetch from the rendered output.
   *
   * ⛔ The invariant is NOT "the sender's host does not appear in the output" — that assertion
   * is wrong, and writing it was my first mistake here. A proxied URL necessarily CONTAINS the
   * sender's host, in its `?src=` parameter; that is how the proxy knows what to fetch. The
   * invariant that actually protects the reader is that every URL the browser resolves points
   * at OUR origin, so no request ever leaves for the sender.
   */
  function fetchableUrls(html: string): string[] {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const urls: string[] = [];
    for (const el of doc.querySelectorAll('*')) {
      for (const attr of ['src', 'srcset', 'background', 'poster']) {
        const value = el.getAttribute(attr);
        if (value) urls.push(value);
      }
      const style = el.getAttribute('style') ?? '';
      for (const match of style.matchAll(/url\(\s*"?([^")]+)"?\s*\)/gi)) urls.push(match[1]);
    }
    return urls;
  }

  it('points every fetchable url at our own origin', () => {
    const urls = fetchableUrls(render(HOSTILE));
    expect(
      urls.length,
      'nothing fetchable survived — the assertion would pass vacuously'
    ).toBeGreaterThan(0);
    for (const url of urls) {
      expect(new URL(url).origin, `${url} escapes our origin`).toBe('https://api.test');
    }
  });

  it('negative control: the unfiltered fixture DOES reach the sender', () => {
    // ⛔ A clean result proves nothing if the check cannot fail. Same fixture, no filtering:
    // the extractor must find urls on the sender's origin.
    const raw = fetchableUrls(HOSTILE);
    const escaping = raw.filter((url) => {
      try {
        return new URL(url).origin === 'https://evil.test';
      } catch {
        return false;
      }
    });
    expect(
      escaping.length,
      'the control found no escaping url — the extractor is blind'
    ).toBeGreaterThan(2);
  });

  it('does not allow the background attribute, which takes a url the img proxy never sees', () => {
    expect(EMAIL_ALLOWED_ATTR).not.toContain('background');
    expect(EMAIL_ALLOWED_ATTR).not.toContain('srcset');
    expect(render('<td background="https://evil.test/c.gif">x</td>')).not.toContain('evil.test');
  });
});

describe('style and link blocks', () => {
  it('drops the element AND its css text, keeping inline style', () => {
    // ⛔ The control that matters: DOMPurify keeps the CHILDREN of a disallowed element by
    // default, and a <style> element's child is the stylesheet TEXT. Without FORBID_CONTENTS
    // the CSS source is pasted into the message as visible text.
    const out = render('<style>.x{color:red}</style><p style="padding:8px">hi</p>');
    expect(out).not.toContain('color:red');
    expect(out).not.toContain('<style');
    expect(out).toContain('padding: 8px');
  });

  it('drops a linked stylesheet', () => {
    expect(render('<link rel="stylesheet" href="https://evil.test/a.css"><p>hi</p>')).not.toContain(
      'evil.test'
    );
  });
});

describe('class rewriting', () => {
  it('prefixes per message and does not double-prefix', () => {
    expect(prefixClasses('btn hero', 5690)).toBe('m_5690_btn m_5690_hero');
    expect(prefixClasses('m_5690_btn', 5690)).toBe('m_5690_btn');
    expect(prefixClasses('btn', 5691)).toBe('m_5691_btn');
  });

  it('means an app class injected by a sender cannot take effect', () => {
    const out = render('<div class="prose dark hidden bg-red-500">x</div>');
    for (const name of ['"prose', ' prose', 'dark"', 'hidden', 'bg-red-500']) {
      expect(out.includes(`"${name}"`), `app class ${name} survived verbatim`).toBe(false);
    }
    expect(out).toContain('m_5690_prose');
    expect(out).toContain('m_5690_bg-red-500');
  });
});

describe('the renderer uses an isolated DOMPurify instance', () => {
  it('leaves the shared instance byte-identical before and after an email render', () => {
    /**
     * 🪤 The obvious version of this test is worthless and I wrote it first: sanitizing
     * `<p class="x" style="color:red">` with `ALLOWED_ATTR: []` strips `class` and `style`
     * BEFORE any `afterSanitizeAttributes` hook runs, so installing the email hooks on the
     * shared instance changes nothing observable and the control passes. Proven — the mutation
     * "use the shared instance" left that version green.
     *
     * This input is chosen so the email hooks WOULD be visible if they were present: `class`
     * survives the config (so the prefixer could rewrite it) and there is an unproxied `<img>`
     * (which the email instance's last-line-of-defence hook removes).
     */
    const probe = '<img src="https://other.test/x.png"><p class="keep">note</p>';
    const config = { ALLOWED_TAGS: ['img', 'p'], ALLOWED_ATTR: ['src', 'class'] };
    const before = DOMPurify.sanitize(probe, config);
    expect(before, 'the probe must carry an img and a class for this control to bite').toContain(
      'other.test'
    );
    expect(before).toContain('class="keep"');

    render('<p class="y" style="color:blue">mail</p>');

    const after = DOMPurify.sanitize(probe, config);
    expect(after).toBe(before);
    expect(after).not.toContain('m_5690_');
  });
});

describe('the image proxy url', () => {
  it('carries the workspace in the path when one is selected', () => {
    expect(imageProxyBase(CONTEXT)).toBe(
      'https://api.test/api/organizations/21/messages/events/5690/image'
    );
  });

  it('falls back to the header-resolved shape when no workspace is selected', () => {
    expect(imageProxyBase({ ...CONTEXT, organizationId: null })).toBe(
      'https://api.test/api/messages/events/5690/image'
    );
  });
});

/**
 * Branch coverage after these: emailCss 100% statements / 96% branches, emailHtml 100% / 88%.
 *
 * ⚠️ What is still uncovered, named rather than left for someone to discover: the
 * `activeContext === null` arms of the class and style hooks in emailHtml. They CANNOT be
 * reached through the public API — `sanitizeEmailHtml` sets the context immediately before
 * `sanitize` and clears it in a `finally`, and the instance is not exported — so covering them
 * would mean exporting internals purely to satisfy a number. They are defence against a future
 * async refactor, and the comment on `activeContext` says so. The rest are regex-alternation
 * fallbacks (`?? ''`) that no input reaches.
 */
describe('the empty and escaped edges (found by branch coverage, pass 13)', () => {
  // Four branches in this filter had no test. They are all the "nothing left" cases, which is
  // where a filter quietly starts emitting `style=""` or keeping a fragment.
  it('drops a declaration whose value is empty', () => {
    expect(filterDeclarations('color:', PROXY)).toBe('');
    expect(filterDeclarations('color: ; padding: 2px', PROXY)).toBe('padding: 2px');
  });

  it('drops a declaration that is only !important', () => {
    expect(filterDeclarations('color: !important', PROXY)).toBe('');
  });

  it('drops a declaration with no colon at all', () => {
    expect(filterDeclarations('color', PROXY)).toBe('');
    expect(filterDeclarations(':red', PROXY)).toBe('');
  });

  it('rewrites a single-quoted url the same as a double-quoted one', () => {
    const single = rewriteCssUrls("url('https://sender.test/a.png')", PROXY);
    const double = rewriteCssUrls('url("https://sender.test/a.png")', PROXY);
    expect(single).toBe(double);
    expect(single).toContain(`${PROXY}?src=`);
  });

  it('resolves a non-hex backslash escape, not just the hex form', () => {
    /**
     * 🪤 Note the DOUBLE backslash. The first version of this test wrote `'a\;b'`, and in
     * JavaScript `\;` is not an escape sequence — the string is literally `a;b` with no
     * backslash in it at all. So the test asserted `normalizeCssText('a;b') === 'a;b'`, passed
     * vacuously, and exercised none of the branch it was written for. Only eslint's
     * `no-useless-escape` caught it; coverage did not move and the suite was green.
     */
    expect('a\\;b').toContain('\\'); // the input really does carry a backslash
    expect(normalizeCssText('a\\;b')).toBe('a;b');
    expect(normalizeCssText('\\"')).toBe('"');
  });

  it('removes an empty class attribute rather than leaving class=""', () => {
    const out = sanitizeEmailHtml('<div class="   ">x</div>', CONTEXT);
    expect(out).not.toContain('class=');
    expect(out).toContain('x');
  });
});
