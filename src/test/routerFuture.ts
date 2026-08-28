/**
 * The v7 future flags the app itself opts into (see `App.tsx`'s `BrowserRouter`).
 *
 * Tests must pass these too. Without them react-router logs a "React Router Future Flag
 * Warning" per router on every run, and — the reason that matters more — a bare
 * `MemoryRouter` exercises v6 state-update and splat-resolution semantics while production
 * runs the v7 ones. Keep this in sync with `App.tsx`.
 */
export const ROUTER_FUTURE = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;
