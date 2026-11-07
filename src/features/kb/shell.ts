/**
 * The light public entry of this feature for the app shell (App and its route helpers, the
 * layout, the processing indicator): code that every page loads first. It re-exports leaf files
 * only and never `./index`, so importing it does not pull the whole feature into the main bundle.
 * Everything else imports `@/features/kb` (the index). CI: `npm run check:shell`.
 */
export { AUTO_ACTIONS_HREF } from './components/autoActions/kbAutoActionCopy';
