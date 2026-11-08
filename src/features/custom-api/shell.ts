/**
 * The light public entry of this feature: leaf files only, never `./index`. Use it from the app
 * shell (App and its route helpers, the layout, the processing indicator: code every page loads
 * first; CI `npm run check:shell`) and from any other feature that needs a small non-UI piece
 * (a hook, constant, helper, service or type). Importing the index instead loads the whole
 * feature, in the page's bundle and in every test that renders the importer. UI comes from
 * `@/features/custom-api`.
 */
export { useInvalidateCustomApiAvailability } from './hooks/useCustomApiLookup';
export {
  CONTACT_NOT_VISIBLE,
  DEFAULT_REFERENCE_NAME,
  LOOKUPS_NOT_ON_SERVER,
  SHAPE_CHANGED_FOR_AGENTS,
  failureSentence,
  referenceNameOf,
} from './lib/customApiLookupText';
export {
  customApiService,
  type CustomApiConnection,
  type CustomApiEndpoint,
  type EndpointTestResult,
  type FieldPick,
} from './services/customApi.service';
export {
  customApiLookupService,
  type CustomApiLookupResult,
  type CustomApiStoredRecord,
  type RunnableLookup,
} from './services/customApiLookup.service';
export {
  customApiTemplateAdminService,
  customApiTemplateService,
  type AdminCustomApiTemplate,
  type CustomApiTemplate,
  type TemplateChecklistItem,
  type TemplateDefinition,
  type TemplateLookup,
} from './services/customApiTemplates.service';
