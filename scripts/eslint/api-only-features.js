/**
 * ESLint rule `boundaries/api-only-features` (modularity task F4).
 *
 * A feature listed in API_ONLY_FEATURES has been moved under `src/features/<feature>/` and has an
 * `index.ts`. Code outside that folder may import it only through `@/features/<feature>` (its index)
 * or `@/features/<feature>/shell` (its light entry for the app shell: leaf files only, so the
 * shell does not pull the whole feature into the main bundle; CI `check:shell`), never a deep path
 * such as `@/features/<feature>/components/X`. Inside the folder anything goes.
 *
 * Each F4 pull request that moves a feature appends it here. The rule resolves `@/x` and relative
 * specifiers the same way as no-upward-imports.js, so it also sees `import type`, `export … from`
 * and lazy `import()`. `vi.mock('…')` strings are not imports and are not checked: a mock has to
 * name the real file the code loads. Nor is a Vite `?raw` import (`import text from 'X.tsx?raw'`):
 * it reads the file's source text, not the module's API, so it also names the real file.
 */
import { relative, sep } from 'node:path';
import { srcPathOf } from './no-upward-imports.js';

export const API_ONLY_FEATURES = [
  'statistics',
  'contacts',
  'subscription',
  'dashboard',
  'custom-api',
  'tickets',
  'kb',
  'settings',
];

const toPosix = (path) => path.split(sep).join('/');

/** The API-only feature a `src/…` path lies in, else null. */
const featureOf = (srcPath) => {
  const match = /^src\/features\/([^/]+)(\/|$)/.exec(srcPath);
  return match && API_ONLY_FEATURES.includes(match[1]) ? match[1] : null;
};

/** True for a public entry: `src/features/<x>/index` or `…/shell`, with or without an extension. */
const isIndex = (srcPath, feature) =>
  /^(index|shell)(\.tsx?)?$/.test(srcPath.slice(`src/features/${feature}/`.length));

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Allow an API-only feature to be imported only through its index.' },
    schema: [],
    messages: {
      deep:
        "'{{specifier}}' reaches inside features/{{feature}}. Import it from '@/features/{{feature}}' " +
        '(its index.ts), or from its shell.ts if this file loads with the app shell; if the name is ' +
        'not exported there yet, add it.',
    },
  },
  create(context) {
    const cwd = context.cwd ?? process.cwd();
    const filename = context.filename ?? context.getFilename();
    const own = toPosix(relative(cwd, filename));
    if (!own.startsWith('src/')) return {};
    const ownFeature = /^src\/features\/([^/]+)\//.exec(own)?.[1] ?? null;

    const check = (node) => {
      if (!node || node.type !== 'Literal' || typeof node.value !== 'string') return;
      if (node.value.endsWith('?raw')) return;
      const target = srcPathOf(cwd, filename, node.value);
      if (target === null) return;
      const feature = featureOf(target);
      if (feature === null || feature === ownFeature || isIndex(target, feature)) return;
      context.report({ node, messageId: 'deep', data: { specifier: node.value, feature } });
    };
    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};
