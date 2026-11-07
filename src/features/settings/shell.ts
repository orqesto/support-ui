/**
 * The light public entry of this feature for the app shell (App and its route helpers, the
 * layout, the processing indicator): code that every page loads first. It re-exports leaf files
 * only and never `./index`, so importing it does not pull the whole feature into the main bundle.
 * Everything else imports `@/features/settings` (the index). CI: `npm run check:shell`.
 */
export {
  CUSTOM_API_LOOKUP_ROUTE,
  CUSTOM_API_TEMPLATE_ROUTE,
} from './components/customApi/lookupPaths';
export {
  kbFullHeldLine,
  kbFullHoldLine,
  retryOwedWithheldLine,
  runStoppedLine,
} from './components/integrations/kbRangeCopy';
