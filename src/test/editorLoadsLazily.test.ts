import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TipTap (~390 kB) loads when an editor is first shown, not with the inbox. One static value import
 * of the editor or its schema from a module the inbox reaches pulls it back into that chunk — the
 * build stays green and only the bundle report shows it. So: only LazyRichTextEditor may import
 * the editor, and the schema is imported statically only by the editor itself and by modules
 * outside the inbox (settings, tickets). Type-only imports are erased and allowed.
 */
const SRC = path.resolve(process.cwd(), 'src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory())
      return name === '__tests__' || name === 'test' ? [] : files(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });

const staticValueImports = (source: string, module: RegExp): boolean =>
  source
    .split(/;\s*\n/)
    .some(
      (statement) =>
        /^\s*(import|export)\s(?!type\s)[^]*?\sfrom\s/.test(statement) && module.test(statement)
    );

const EDITOR = /from '(@\/components\/shared|\.)\/RichTextEditor'/;
const SCHEMA = /from '@\/lib\/editorSchema'/;
const SCHEMA_ALLOWED = [
  'components/shared/RichTextEditor.tsx',
  'lib/zendeskMacros.ts', // Settings → Zendesk macro import
  'components/tickets/TicketUpdateAssist.tsx', // Tickets
];

const offenders = (module: RegExp, allowed: string[]) =>
  files(SRC)
    .filter((file) => staticValueImports(readFileSync(file, 'utf8'), module))
    .map((file) => path.relative(SRC, file))
    .filter((file) => !allowed.includes(file));

describe('the rich-text editor loads lazily', () => {
  it('control: the scan sees a value import and ignores a type-only one', () => {
    expect(staticValueImports("import RichTextEditor from './RichTextEditor';\n", EDITOR)).toBe(
      true
    );
    expect(
      staticValueImports("import type { RichTextEditorHandle } from './RichTextEditor';\n", EDITOR)
    ).toBe(false);
    expect(files(SRC).length).toBeGreaterThan(200);
  });

  it('only LazyRichTextEditor imports the editor', () => {
    expect(offenders(EDITOR, ['components/shared/LazyRichTextEditor.tsx'])).toEqual([]);
  });

  it('the editor schema is imported statically only outside the inbox', () => {
    expect(offenders(SCHEMA, SCHEMA_ALLOWED)).toEqual([]);
  });
});
