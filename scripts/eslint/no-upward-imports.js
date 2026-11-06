/**
 * ESLint rule `boundaries/no-upward-imports` (modularity task F1).
 *
 * A file in a lower layer must not import a component, a page, a feature or the app root. The
 * layers and areas are the ones scripts/ci/check-boundaries.mjs counts (`areaOf` in
 * scripts/ci/import-graph.mjs), so the rule and the ratchet never disagree on what "upward" means.
 * eslint.config.js turns it on as an error for `src/components/ui/**` and `src/lib/**`, the two
 * layers that should never have any; the other lower layers are held by the ratchet until F2.
 *
 * It resolves `@/x` and relative specifiers to a path under `src/` without reading the target, so
 * it also sees `import type`, `export … from` and lazy `import()`.
 */
import { existsSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { areaOf } from '../ci/import-graph.mjs';

const isFeature = (area) => area.startsWith('components/') || area.startsWith('features/');
const isUpperLayer = (area) =>
  area === 'app' || area === 'pages' || area === 'components' || isFeature(area);

const toPosix = (path) => path.split(sep).join('/');

/** `src/…` for an import of the src tree, else null (a package). */
export const srcPathOf = (cwd, filename, specifier) => {
  let absolute;
  if (specifier.startsWith('@/')) absolute = join(cwd, 'src', specifier.slice(2));
  else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    absolute = join(dirname(filename), specifier);
  } else return null;
  const path = toPosix(relative(cwd, absolute));
  if (!path.startsWith('src/')) return null;
  // A folder import (`@/types`, `@/components/ui`) means its index file.
  const isDir = existsSync(absolute) && statSync(absolute).isDirectory();
  return isDir ? `${path}/index` : path;
};

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow a lower layer importing a component, page or feature.' },
    schema: [],
    messages: {
      upward:
        "'{{specifier}}' is {{target}}: {{source}} must not import components, pages or features. " +
        'Move the shared piece down (lib/, a service, a types file) or pass it in.',
    },
  },
  create(context) {
    const cwd = context.cwd ?? process.cwd();
    const filename = context.filename ?? context.getFilename();
    const own = toPosix(relative(cwd, filename));
    if (!own.startsWith('src/')) return {};
    const source = areaOf(own);

    const check = (node) => {
      if (!node || node.type !== 'Literal' || typeof node.value !== 'string') return;
      const target = srcPathOf(cwd, filename, node.value);
      if (target === null) return;
      const area = areaOf(target);
      if (area === source || !isUpperLayer(area)) return;
      context.report({
        node,
        messageId: 'upward',
        data: { specifier: node.value, target: area, source },
      });
    };
    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};
