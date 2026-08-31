import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';

/**
 * A control whose only child is an icon has no accessible name unless one is given
 * explicitly. A staging sweep at a 485px viewport found the Needs Routing card had shed
 * both of its labels: Route rendered as a bare arrow with no name at all, and spam as a
 * bare ⊘ whose only name was a `title` no touch device shows. Across the app there were
 * 108 such controls.
 *
 * This parses each file and walks the real JSX children of every <Button>/<button>,
 * classifying each child as "renders text" or "renders an icon". It fails on any control
 * that renders only icons and carries neither `aria-label` nor an `.sr-only` child.
 *
 * Two earlier regex versions of this check were wrong in opposite directions and both
 * are the reason it is written against the parser instead:
 *   - the first treated the `'…'` busy-state literal as a label, so it passed against
 *     the exact Needs Routing button it was written for;
 *   - the second treated `{label}` and `{att.filename}` as unlabelled, flagging a dozen
 *     buttons that render perfectly good text from a prop.
 * Before trusting any change to it, delete one known-good `aria-label` and confirm it
 * goes red. A source-scanning assertion that has never been seen to fail proves nothing.
 */

/**
 * The Button primitive itself: its name comes from `children` at each call site, and
 * `{...props}` forwards any `aria-label` through. Not a control in its own right.
 */
const NOT_A_CALL_SITE = new Set(['src/components/ui/Button/Button.tsx']);

type Finding = { file: string; line: number; detail: string };

/** Does this JSX child put readable text on screen? */
const rendersText = (node: ts.Node): boolean => {
  if (ts.isJsxText(node)) return /[A-Za-z]/.test(node.text);

  if (ts.isJsxExpression(node)) {
    if (!node.expression) return false;
    return rendersTextExpression(node.expression);
  }

  // <>…</> and <span>…</span> — recurse; a nested element may hold the label.
  if (ts.isJsxFragment(node)) return node.children.some(rendersText);
  if (ts.isJsxElement(node)) {
    // A capitalised, childless element is an icon. A lowercase host element or one
    // with children may wrap the label.
    return node.children.some(rendersText);
  }
  return false;
};

const rendersTextExpression = (expr: ts.Expression): boolean => {
  // `{label}`, `{att.filename}`, `{msg?.subject}` — a value rendered as text.
  if (
    ts.isIdentifier(expr) ||
    ts.isPropertyAccessExpression(expr) ||
    ts.isElementAccessExpression(expr)
  )
    return true;
  if (ts.isNonNullExpression(expr) || ts.isParenthesizedExpression(expr))
    return rendersTextExpression(expr.expression);
  // `{busy ? '…' : <Icon />}` — a branch counts only if that branch renders text.
  if (ts.isConditionalExpression(expr))
    return rendersTextExpression(expr.whenTrue) || rendersTextExpression(expr.whenFalse);
  // `{cond && <span>Text</span>}`, `{a ?? b}`
  if (ts.isBinaryExpression(expr))
    return rendersTextExpression(expr.left) || rendersTextExpression(expr.right);
  if (ts.isCallExpression(expr)) return true; // e.g. {t('save')}, {formatCount(n)}
  if (ts.isTemplateExpression(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
    return /[A-Za-z]/.test(expr.getText());
  if (ts.isStringLiteral(expr)) return /[A-Za-z]/.test(expr.text);
  if (ts.isJsxElement(expr) || ts.isJsxFragment(expr)) return rendersText(expr);
  return false;
};

const hasAttr = (node: ts.JsxOpeningElement, name: string) =>
  node.attributes.properties.some(
    (prop) => ts.isJsxAttribute(prop) && prop.name.getText() === name
  );

/** An `.sr-only` child is a visually hidden but perfectly good label. */
const hasSrOnlyChild = (children: readonly ts.JsxChild[]): boolean =>
  children.some((child) => /sr-only/.test(child.getText()));

const findUnnamedIconControls = (): Finding[] => {
  const files = execSync("grep -rl '<Button\\|<button' src --include='*.tsx' | grep -v __tests__", {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((path) => !NOT_A_CALL_SITE.has(path));

  const found: Finding[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    const visit = (node: ts.Node): void => {
      if (ts.isJsxElement(node)) {
        const tag = node.openingElement.tagName.getText();
        if (tag === 'Button' || tag === 'button') {
          const named =
            hasAttr(node.openingElement, 'aria-label') ||
            hasAttr(node.openingElement, 'aria-labelledby') ||
            hasSrOnlyChild(node.children) ||
            node.children.some(rendersText);
          const hasIconChild = node.children.some(
            (child) => ts.isJsxSelfClosingElement(child) && /^[A-Z]/.test(child.tagName.getText())
          );
          const hasIconAnywhere =
            hasIconChild || /<[A-Z][A-Za-z0-9]*\b[^>]*\/>/.test(node.getText());
          if (!named && hasIconAnywhere) {
            const { line } = source.getLineAndCharacterOfPosition(node.getStart());
            found.push({
              file,
              line: line + 1,
              detail: node.getText().replace(/\s+/g, ' ').slice(0, 90),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
};

describe('icon-only controls', () => {
  it('every icon-only button carries an accessible name', () => {
    const unnamed = findUnnamedIconControls();
    const report = unnamed.map((hit) => `${hit.file}:${hit.line}  ${hit.detail}`).join('\n');
    expect(report, `icon-only controls with no accessible name:\n${report}`).toBe('');
  });
});
