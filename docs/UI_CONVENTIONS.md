# UI conventions

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

| Instead of… | Use |
|---|---|
| `<button>` | `Button` — `variant` (default/outline/ghost/destructive), `size` (sm/md), `isLoading` |
| `<input type="text">` | `Input` |
| a search field | `SearchInput` — `value`, `onChange(value: string)`, optional `showSearchButton`, `onSearch` |
| `<select>` | `Select` (native) or `ReactSelect` (searchable/rich) |
| `<textarea>` | `Textarea` |
| a status/tag `<span>` pill | `Badge` — `variant`: default / success / warning / danger / secondary; `size`: sm/md/lg |
| a bordered `<div>` panel | `Card` (+ `CardHeader`, `CardContent`, `CardTitle`, `CardDescription`); `padding` prop controls insets |
| a checkbox/switch | `Toggle` |
| a modal | `Dialog`, or `ConfirmDialog` / `AlertDialog` for confirmations |
| an inline notice | `Alert` |
| a spinner SVG | `Spinner` — `size`, `className` |
| a tab row of `<button>`s | `Tabs` |

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
