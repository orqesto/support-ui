# Frontend conventions (support-ticket-ui)

<!-- docs-status
verified-on: 2026-08-21
verified-against: FE main e270f0b · prod BE v1.1.241 (9409e455)
status: corrected
-->

Instructions for anyone (human or AI) writing code in this repo. Loaded automatically by Claude Code.

## UI: use the design system — never raw HTML controls

All UI is built from the design-system components in **`src/components/ui/`**. Do **not** drop to
raw HTML form controls or ad-hoc styled elements. The components carry theming (light/dark),
focus/hover states, sizing, and accessibility that raw elements don't — using raw HTML creates
visual and behavioural drift.

**Never write** raw `<button>`, `<input>`, `<select>`, `<textarea>`, or hand-styled `<span>`/`<div>`
"pills"/"cards" for UI. Use the component instead:

| Need | Use | Not |
|------|-----|-----|
| Button / action | `Button` (`variant`, `size`, `isLoading`) | `<button>` |
| Text field | `Input` | `<input>` |
| Search box | `SearchInput` (`value`, `onChange(value)`, `showSearchButton`) | `<input>` |
| Dropdown (native) | `Select` | `<select>` |
| Dropdown (rich/searchable) | `ReactSelect` | custom |
| Multi-line text | `Textarea` | `<textarea>` |
| Status / tag / chip | `Badge` (`variant`: default/success/warning/danger/secondary) | styled `<span>` |
| Card / panel container | `Card` (+ `CardHeader`/`CardContent`/`CardTitle`, `padding` prop) | styled `<div>` |
| Toggle / switch | `Toggle` | `<input type=checkbox>` |
| Tabs | `Tabs` | styled `<button>` row |
| Loading | `Spinner` | inline SVG |
| Dialog / confirm | `Dialog` / `ConfirmDialog` / `AlertDialog` | custom modal |
| Alert / inline notice | `Alert` | styled `<div>` |
| Label | `Label` | `<label>` |
| Pagination | `Pagination` | custom |
| Table / list of records | `DataTable` | hand-rolled `<table>` |
| Progress bar | `Progress` | styled `<div>` |
| Tooltip | `Tooltip` | `title=""` only |
| Text / headings | `Typography` where it fits | — |
| External link | `ExternalLink` | `<a target=_blank>` |

Full inventory: `Alert, AlertDialog, Badge, Button, Card, ConfirmDialog, DataTable, Dialog, Drawer,
ExternalLink, Input, Label, ListCard, Pagination, Progress, ReactSelect, SearchInput, Select,
Spinner, Tabs, Textarea, Toggle, Tooltip, Typography`.
(Generated from `src/components/ui/` on 2026-08-21.)

**If a needed component doesn't exist, extend an existing one or add a new one to
`src/components/ui/`** (following the folder pattern: `Component.tsx`, `component.styles.ts`,
`component.types.ts`, `index.ts`) — don't work around it with raw HTML.

Semantic layout elements (`<ul>`/`<li>`/`<section>`/`<nav>` for structure) are fine; the rule is
about **controls and styled primitives**, which must come from the design system.

See `docs/UI_CONVENTIONS.md` for details and examples.

## Other

- Services live in `src/services/*.service.ts` and go through `@/lib/api-client` (`apiClient`).
  Don't call `fetch` directly from components.
- Lint runs on PRs (`type-check + lint`) and blocks merge. Run `npm run type-check` and
  `npm run lint` before pushing. Note the `id-length` rule — no single-letter identifiers.
- ⚠️ **A push to `main` deploys production.** There is no tag gate here — unlike `BE-service`,
  which ships on a `vX.Y.Z` tag. Docs-only commits deploy too, so branch and open a PR rather than
  pushing straight to `main`.
- ⚠️ **Guard against FE/BE version skew.** The FE can reach prod before a coupled BE change does, so
  a component reading a field the deployed BE does not send yet will white-screen. Normalise new
  fields defensively in `*.service.ts` so both shapes are tolerated.
