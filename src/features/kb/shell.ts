/**
 * The light public entry of this feature: leaf files only, never `./index`. Use it from the app
 * shell (App and its route helpers, the layout, the processing indicator: code every page loads
 * first; CI `npm run check:shell`) and from any other feature that needs a small non-UI piece
 * (a hook, constant or helper). Importing the index instead loads the whole feature, in the
 * page's bundle and in every test that renders the importer. UI comes from `@/features/kb`.
 */
export { AUTO_ACTIONS_HREF } from './components/autoActions/kbAutoActionCopy';
export {
  type Documentation,
  type DocumentationProgress,
  documentationService,
  type DocumentType,
} from './services/documentation.service';
export { type KbMiningForecast, kbService } from './services/kb.service';
