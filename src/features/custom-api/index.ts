/**
 * The custom-API feature (the custom-API connection, lookup and template services, the lookup
 * hooks and the lookup wording). This file is its only public entry: code outside `src/features/custom-api/` imports from
 * `@/features/custom-api`, never a deep path (ESLint `boundaries/api-only-features`). Export only
 * what pages or other features use.
 */
export {
  useCustomApiLookup,
  useCustomApiLookupAvailability,
  useCustomApiLookupAvailabilityState,
  useCustomApiLookupOptions,
  useCustomApiLookupOptionsSettled,
  useInvalidateCustomApiAvailability,
} from './hooks/useCustomApiLookup';
export {
  ADMIN_CAN_SEE_DETAILS,
  CONTACT_NOT_VISIBLE,
  DEFAULT_REFERENCE_NAME,
  failureSentence,
  GENERIC_FAILURE,
  LOOKUPS_NOT_ON_SERVER,
  lookupListLine,
  noMatchHintText,
  notFoundText,
  pressPrompt,
  referenceHintText,
  referenceNameOf,
  SHAPE_CHANGED_FOR_AGENTS,
  skippedText,
} from './lib/customApiLookupText';
export { customApiService } from './services/customApi.service';
export type {
  CustomApiConnection,
  CustomApiEndpoint,
  EndpointTestResult,
  FieldPick,
} from './services/customApi.service';
export { customApiLookupService } from './services/customApiLookup.service';
export type {
  CustomApiLookupResult,
  CustomApiStoredRecord,
  LookupField,
  LookupRun,
  LookupSurface,
  RunnableLookup,
} from './services/customApiLookup.service';
export {
  customApiTemplateAdminService,
  customApiTemplateService,
} from './services/customApiTemplates.service';
export type {
  AdminCustomApiTemplate,
  CustomApiTemplate,
  TemplateChecklistItem,
  TemplateDefinition,
  TemplateLookup,
} from './services/customApiTemplates.service';
