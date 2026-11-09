/**
 * The light public entry of this feature: leaf files only, never `./index`. Use it from the app
 * shell (App and its route helpers, the layout, the processing indicator: code every page loads
 * first; CI `npm run check:shell`) and from any other feature that needs a small non-UI piece
 * (a hook, constant or helper). Importing the index instead loads the whole feature, in the
 * page's bundle and in every test that renders the importer. UI comes from `@/features/settings`.
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
export { useAiDraftsOff, useRefreshAiDrafts } from './hooks/useAiDraftsOff';
export {
  CATEGORY_RECORD_LABELS,
  CATEGORY_TAB_LABELS,
  type CustomApiCategory,
  readCategory,
} from './components/customApi/categories';
