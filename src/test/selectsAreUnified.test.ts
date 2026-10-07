import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';

/**
 * Every "pick from a list" control is the one `Select` from `@/components/ui/Select`.
 *
 * Until 2026-10 the app had a native `<select>` wrapper (65 uses), a react-select wrapper (80 uses,
 * 8px shorter), two raw `<select>` tags and several hand-built dropdowns — one page could show all
 * three looks side by side. These checks keep it from drifting back:
 *   1. no raw `<select>` outside `src/components/ui/`;
 *   2. nothing outside `src/components/ui/` imports `react-select` directly;
 *   3. every `<Select>` has an accessible name: `label`, `aria-label`, `aria-labelledby`, or an
 *      `id`/`inputId` that a `htmlFor` in the same file points at.
 *
 * Check 3 walks the parsed JSX, not regex. Before trusting a change to it, delete one `label=` and
 * watch it go red.
 */

/** Every app source file outside the design system and the tests (a plain walk: no shell quoting). */
const sourceFiles = (dir = 'src'): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });

const callSites = (pattern: RegExp) =>
  sourceFiles()
    .filter((file) => !file.startsWith('src/test/') && !file.startsWith('src/components/ui/'))
    .filter((file) => pattern.test(readFileSync(file, 'utf8')));

const attrText = (attr: ts.JsxAttribute, source: ts.SourceFile) =>
  attr.initializer ? attr.initializer.getText(source).replace(/^\{|\}$/g, '').trim() : 'true';

export const unlabelledSelects = (file: string, text: string) => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const htmlFors = new Set<string>();
  const selects: Array<{ line: number; attrs: Map<string, string> }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const attrs = new Map<string, string>();
      for (const prop of node.attributes.properties) {
        if (ts.isJsxAttribute(prop)) attrs.set(prop.name.getText(source), attrText(prop, source));
        // `{...props}` may carry a label we cannot see: count it as labelled.
        if (ts.isJsxSpreadAttribute(prop)) attrs.set('...spread', 'true');
      }
      if (attrs.has('htmlFor')) htmlFors.add(attrs.get('htmlFor') as string);
      if (node.tagName.getText(source) === 'Select') {
        selects.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, attrs });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return selects
    .filter(({ attrs }) => {
      // A popover names its panel and search box from label / aria-label ONLY — it forwards
      // neither an id nor aria-labelledby. `variant="popover"` and `variant={'popover'}` alike.
      if ((attrs.get('variant') ?? '').replace(/['"`]/g, '') === 'popover') {
        return !['label', 'aria-label', '...spread'].some((key) => attrs.has(key));
      }
      if (['label', 'aria-label', 'aria-labelledby', '...spread'].some((key) => attrs.has(key))) return false;
      const id = attrs.get('id') ?? attrs.get('inputId');
      return !(id && htmlFors.has(id));
    })
    .map(({ line }) => `${file}:${line}`);
};

describe('one Select everywhere', () => {
  it('no raw <select> outside src/components/ui', () => {
    expect(callSites(/<select(\s|>|$)/m)).toEqual([]);
  });

  it('react-select is imported only by src/components/ui', () => {
    expect(callSites(/from 'react-select/)).toEqual([]);
  });

  it('every <Select> has an accessible name', () => {
    const offenders = callSites(/<Select(\s|$)/m).flatMap((file) =>
      unlabelledSelects(file, readFileSync(file, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('the file walk finds known call sites (control: an empty list must not pass by finding nothing)', () => {
    expect(callSites(/<Select(\s|$)/m)).toContain('src/pages/LoginPage.tsx');
    expect(sourceFiles()).toContain('src/components/ui/Select/Select.tsx');
  });

  it('the labelling check itself catches an unlabelled Select (control)', () => {
    const fixture = `
      const A = () => <><Select options={[]} /><Select label="Ok" options={[]} />
        <Label htmlFor="dept">Dept</Label><Select id="dept" options={[]} />
        <Select id="orphan" options={[]} />
        <Label htmlFor="pop">P</Label><Select variant="popover" id="pop" options={[]} />
        <Select variant={'popover'} aria-labelledby="x" options={[]} /><Select variant="popover" aria-label="Ok" options={[]} /></>;`;
    expect(unlabelledSelects('fixture.tsx', fixture)).toEqual([
      'fixture.tsx:2',
      'fixture.tsx:4',
      'fixture.tsx:5',
      'fixture.tsx:6',
    ]);
  });
});
