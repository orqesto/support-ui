# Frontend architecture: features and module boundaries

How `src/` is organised and the rules CI enforces. Written after the modularity work (tasks F1–F8,
2026-11); the per-file history is in git, the rationale is here.

## Layers

| Layer | Folders | May import |
|---|---|---|
| App shell | `src/App.tsx`, `src/main.tsx`, `pages/*Routes.tsx`, `components/layout`, `components/processing` | everything below, but features only through `@/features/<x>/shell` |
| Pages | `src/pages` (thin: route + composition) | features (index or shell), shared, lower layers |
| Features | `src/features/<x>/{components,hooks,services,stores,lib,utils}` | other features through their public entries, shared, lower layers |
| Shared UI | `components/ui` (design system), `components/shared` (generic UI used by 2+ features, no data owner) | lower layers |
| Lower layers | `lib`, `hooks`, `services`, `stores`, `types`, `utils`, `contexts` | each other only — never a feature, page or component above them |

Features today: statistics, contacts, subscription, dashboard, custom-api, tickets, kb, settings,
messages. Files used by one feature live in it; a file used by 2–3 features goes to the feature
that owns the data (others import it through that feature's entry); a file used by 4+ features, or
by a lower layer, stays app-wide (`lib/`, `hooks/`, `services/`, `stores/`).

## A feature's two public entries

Code outside `src/features/<x>/` imports a feature only through:

- **`@/features/<x>`** (`index.ts`): its UI and everything else it offers. Importing it loads the
  whole feature.
- **`@/features/<x>/shell`** (`shell.ts`): a light entry of leaf files only (never `./index`) for
  the app shell and for other features that need a small piece: a hook, constant, helper,
  service or type, or a tiny leaf component such as a chip or icon (owner, 2026-11-08). Keep a shell leaf free of heavy imports and of top-level work: whatever it
  pulls in lands in every importer, the main bundle included.

Inside a feature, files import each other directly, never through their own index.

Re-exports of types only are written `export type { T } from './x'`. The inline form
`export { type T } from './x'` compiles to `export {} from './x'` and still loads `./x`; in an
index that made a page download its lazy board view eagerly.

Lazy route chunks (`import('…')` in a page, e.g. the thread view, board, contacts view and compose
in `MessagesPage`) keep their deep path, with a one-line lint exception that says so: through the
index they would load with the page.

## What CI checks (`.github/workflows/pr-checks.yml`)

| Check | Script | Fails when |
|---|---|---|
| `npm run lint` | `scripts/eslint/no-upward-imports.js`, `api-only-features.js` | a lower layer imports upward; code outside a feature reaches past its index/shell |
| `check:boundaries` | `scripts/ci/check-boundaries.mjs` | feature → feature imports or upward imports grow past `.ci/baselines/boundaries.json` |
| `check:cycles` | `scripts/ci/check-cycles.mjs` | import cycles grow past `.ci/baselines/cycles.json` |
| `check:shell` | `scripts/ci/check-shell-bundle.mjs` | a feature index is reachable from `src/main.tsx` by static imports; an index/shell has an inline type-only re-export |
| `check:bundle` | `scripts/ci/check-bundle.mjs` (after `vite build`) | the main chunk grows past `.ci/baselines/bundle.json`; a page also imports one of its lazy chunks statically |

Ratchets only go down on their own: lock a drop in with `--update`. Moving files into a feature
can make existing imports newly countable; `check:boundaries -- --adopt` records those only when
every edge is proven to have existed before the move (through git renames, the old index or shell,
or a re-export shim the change deleted). Upward imports and cycles are never adoptable.

## Moving code into a feature

1. `git mv` the files (and their tests) into `src/features/<x>/…`.
2. `node scripts/codemod/move-feature-imports.mjs <x>` rewrites import specifiers; it prints the
   names outside code takes, which the index must export.
3. Small non-UI pieces other features or the shell use go in `shell.ts`; UI in `index.ts`.
4. Run type-check, lint, the four `check:*` scripts and the full suite; compare the `vite build`
   main chunk with staging before pushing.

Tests that read source files by path (`readFileSync`) or match import text are not rewritten by
the codemod: move them next to their subject or update the path.
