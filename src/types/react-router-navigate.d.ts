/**
 * react-router 7 types `navigate()` as `void | Promise<void>` because the same hook serves data
 * routers, where it returns a Promise. This app uses `<BrowserRouter>` (declarative mode), where
 * navigate returns nothing, so the union only made every call a floating-promise lint error.
 * This is the augmentation react-router documents for `<BrowserRouter>` apps (see the note above
 * `useNavigate` in react-router's index.d.ts). Switching to `<RouterProvider>` means removing it.
 */
import type { NavigateOptions, To } from 'react-router';

declare module 'react-router' {
  interface NavigateFunction {
    (to: To, options?: NavigateOptions): void;
    (delta: number): void;
  }
}
