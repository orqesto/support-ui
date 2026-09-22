# UI conventions

<!-- docs-status
verified-on: 2026-08-21
verified-against: FE main e270f0b
status: point-in-time
-->

> 📌 Not claim-verified in detail, but the component inventory in `../CLAUDE.md` was: it was missing `DataTable`. Check any inventory here against `src/components/ui/`.

The app has a design system in **`src/components/ui/`**. Build all UI from it. This keeps the
product visually consistent, correct in light **and** dark themes, and accessible — none of which
raw HTML elements give you for free.

## The rule

> Never use raw HTML form controls or hand-styled primitives for UI. Use the design-system
> component. If one is missing, extend an existing component or add a new one — don't fall back to
> raw HTML.

This applies to: buttons, text inputs, search boxes, selects/dropdowns, textareas, checkboxes/
toggles, status chips/badges, cards/panels, dialogs, alerts, tooltips, tabs, pagination, progress,
spinners, and labels.

Plain **layout** elements (`<div>`, `<section>`, `<ul>`/`<li>`, `<nav>`) are fine — the rule is
about interactive controls and styled primitives.

## Component map

| Instead of…                | Use                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `<button>`                 | `Button` — `variant` (default/outline/ghost/destructive), `size` (sm/md), `isLoading`                  |
| `<input type="text">`      | `Input`                                                                                                |
| a search field             | `SearchInput` — `value`, `onChange(value: string)`, optional `showSearchButton`, `onSearch`            |
| `<select>`                 | `Select` (native) or `ReactSelect` (searchable/rich)                                                   |
| `<textarea>`               | `Textarea`                                                                                             |
| a status/tag `<span>` pill | `Badge` — `variant`: default / success / warning / danger / secondary; `size`: sm/md/lg                |
| a bordered `<div>` panel   | `Card` (+ `CardHeader`, `CardContent`, `CardTitle`, `CardDescription`); `padding` prop controls insets |
| a checkbox/switch          | `Toggle`                                                                                               |
| a modal                    | `Dialog`, or `ConfirmDialog` / `AlertDialog` for confirmations                                         |
| an inline notice           | `Alert`                                                                                                |
| a spinner SVG              | `Spinner` — `size`, `className`                                                                        |
| a tab row of `<button>`s   | `Tabs`                                                                                                 |

## Examples

```tsx
// ❌ raw HTML
<input type="text" value={q} onChange={(e) => setQ(e.target.value)} className="border rounded …" />
<span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">In KB</span>
<button className="px-3 py-1 border rounded" onClick={onAdd}>Add</button>

// ✅ design system
<SearchInput value={q} onChange={setQ} placeholder="Search…" />
<Badge variant="success" size="sm">In KB</Badge>
<Button variant="outline" size="sm" onClick={onAdd}>Add</Button>
```

## Adding a component

If nothing fits, add one under `src/components/ui/<Name>/` following the existing pattern:

```
<Name>/
  <Name>.tsx          # component
  <name>.styles.ts    # class-variance-authority variants
  <name>.types.ts     # prop types (VariantProps<typeof variants> & { … })
  index.ts            # re-export
```

Prefer extending an existing component (new `variant`/`size`) over creating a near-duplicate.

## Colour

Every colour comes from a token in `src/index.css`. The values are shadcn-shaped
`H S% L%` triplets, so `bg-background`, `text-muted-foreground` and the rest of the
Tailwind utilities work unchanged.

**Six roles, and each carries one meaning.** A seventh hue means a seventh thing to
learn, and it makes every existing one mean slightly less.

| Role          | Means             | Use for                                                   |
| ------------- | ----------------- | --------------------------------------------------------- |
| `primary`     | interactive       | links, primary buttons, focus rings, the selected tab     |
| `ai`          | a machine did it  | translation, classification, suggested replies, AI drafts |
| `note`        | internal-only     | notes, anything the customer must never see               |
| `success`     | resolved, healthy | approved, resolved, healthy SLA                           |
| `warning`     | needs attention   | on hold, expiring window                                  |
| `destructive` | failed, harmful   | spam, delete, failed send, breached SLA                   |

⛔ **`warning` and `note` are the same hue and NOT the same promise.** Amber on a note
means "the customer cannot see this"; amber on a chip means "look at this". Never
collapse one into the other — it makes _"is this visible to them?"_ unanswerable at a
glance.

⛔ **Blue is only ever interactive.** If it is blue, clicking it does something. A
status icon or a decorative glyph takes `muted-foreground`, a machine one takes `ai`.

**Identity hues for counts — `attention`, `caution`, `pending` (2026-09-22).** NOT state
roles, and not for anything but telling COUNT tiles apart (the dashboard), where the owner
wants each tile recognisable by colour as well as text. `attention` = a customer is waiting on
us (Client Replied), `caution` = in motion / waiting (Awaiting, In Progress), `pending` = parked
(Pending, and the third KB card); the KB tiles are `ai` · `caution` · `pending`. Each has `DEFAULT / foreground / muted / line` in light and
dark. `attention` is magenta (330°), not orange: in dark, red/orange/amber/yellow read alike
(measured 2026-09-22 — Client Replied and Not Analysed were indistinguishable). Use
them through `components/dashboard/dashboardTones.ts`; never as inline hex.

**Elevation, not one flat white:** `background` (the canvas) → `card` → `raised`
(inputs, chips) → `sunken` (table heads, code). A message is a card ON the canvas, so
it has its own `bubble` ground; a reply we wrote uses the `agent-*` family. Dark stack (widened
2026-09-22 so a card reads as lying ON the canvas): canvas 12% · card 16% · raised 18% ·
sunken 10% · bubble 19% · well 23%.

### Two traps that have already cost real time

**In dark, the role tokens are TEXT-weight colours.** `--destructive` is a pale pink,
not a red slab. So `bg-destructive` is only correct when the label moves to
`text-destructive-foreground` (near-black in dark) in the same breath. A fill without
its foreground is unreadable in one theme and nothing in CI will say so.

**Don't tint text with opacity.** `text-foreground/55` over a tinted ground drops below
4.5:1. Use `muted-foreground` or `faint-foreground`, which are measured against `card`.

### Public pages

Anything a customer opens without auth renders inside `.surface-light`, which re-declares
the light values for the subtree **and paints its own ink and ground**. Redeclaring the
variables alone is not enough: `color` inherits from outside the scope, which is exactly
how the tracking-page heading once rendered at 1.05:1. Every full-height root on such a
page needs the class, not just the main one.

## Type

Three faces, and the rule is one line: **Grotesk for labels, Sans for language, Mono for
identifiers.**

| Class                 | Face            | For                                                                                                                                                                      |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `font-display`        | Space Grotesk   | things you scan: headings, uppercase labels, tab names, chip labels, subjects, button text, sender names on bubbles. Weight 500–600; tracking `.08–.11em` when uppercase |
| `font-sans` (default) | Instrument Sans | things you read: email bodies, notes, AI drafts, KB article text, tooltips, descriptions, the composer, any full sentence. Weight 400, 13–14.5px, line-height 1.55–1.62  |
| `font-mono`           | JetBrains Mono  | things you verify character by character or compare in a column: addresses, ticket ids, order and tracking numbers, money, counts, timestamps in lists, code             |

⛔ **A label is not an identifier.** Mono was doing double duty as the label face, which
left nothing distinguishing `DEPT` from an order number.

**The shared components carry the face**: `Button`, `Badge`, `CardTitle`, `DialogTitle` and the `Typography` heading/label variants are Grotesk, so tabs (rendered through `Button`) are too. A caller showing an identifier inside one passes `font-mono`; `cn()` lets it win.

⛔ **`tabular-nums` is redundant on `font-mono`.** JetBrains Mono is monospaced, so its
digits already advance equally; the class is for proportional faces. Figures set in mono
are already tabular.

## Conformance, as of 2026-09-22

Measured on `feat/message-detail-v3-logic` (= `staging` + message-detail v3; the numbers below
did not change in it):

- **13** raw Tailwind palette classes, in **3** files — all deliberate: the categorical avatar
  hues and documentation colour map (`inboxCardHelpers.tsx`, `DocumentationList.tsx`) and the
  modal scrim (`Layout.tsx`). Was 1,179 before #449.
- **36** `bg-white` / `text-white` / `text-black` / `bg-black` — white text on user-chosen label
  and avatar colours (set inline from data) and scrims. Not a role; leave them.
- **309** `font-display`, **293** `font-mono` usages. The shared `Button`, `Badge`, `CardTitle`,
  `DialogTitle` and `Typography` heading/label variants carry Grotesk themselves.
- "Needs Routing" is **neutral** (owner, 2026-09-21): a dashed outline on the list chip and
  card badge, a strong-neutral sidebar count.

⚠️ Known and not fixed: assignee initials on the categorical avatar palette measure
**2.04–3.46:1** (white on the lighter hues). The palette is data, so this needs a decision.

### If you migrate some of it

Two failure modes have bitten this work, both invisible to type-check and tests:

1. **An orphaned opacity suffix.** A regex matching `bg-blue-100 dark:bg-blue-500` inside
   `…/15` leaves `bg-primary-muted/15` and applies a dark-theme opacity to light.
2. **Rebuilding class strings with `split()`/`join()`.** It runs on every quoted string,
   not just class lists, and eats the spacing out of user-visible copy
   (`'Showing 53 of '` → `'Showing 53 of'`).

And verify in a **built** app: a class in a source file is not a rendered colour, and a
hidden automation tab pauses CSS transitions, which freezes measured colours mid-flight.
