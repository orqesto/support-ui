/**
 * The custom-API feature: the connection, lookup and template services, the lookup hooks and
 * wording, and the lookup UI shown in a thread or a contact (lookup panel, result cards, record
 * insert, the Lookups tab). This file is its only public entry: code outside
 * `src/features/custom-api/` imports from `@/features/custom-api`, never a deep path (ESLint
 * `boundaries/api-only-features`). Export only what pages or other features use.
 */
export {
  CustomApiLookupPanel,
  hasLookupEmailIdentity,
  NO_EMAIL_IDENTITY_NOTE,
} from './components/CustomApiLookupPanel';
export { CustomApiRecordInsert } from './components/CustomApiRecordInsert';
export { CustomApiResultCard } from './components/CustomApiResultCard';
export { appendReplyParagraph, replyHasSentence } from './components/customApiRecordNote';
export { useLookupsTab } from './components/lookupsTab';
export type { AddOutcome } from './components/recordInsertOutcome';
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
  lookupListLine,
  LOOKUPS_NOT_ON_SERVER,
  noMatchHintText,
  notFoundText,
  pressPrompt,
  referenceHintText,
  referenceNameOf,
  SHAPE_CHANGED_FOR_AGENTS,
  skippedText,
} from './lib/customApiLookupText';
export {
  type CustomApiConnection,
  type CustomApiEndpoint,
  customApiService,
  type EndpointTestResult,
  type FieldPick,
} from './services/customApi.service';
export {
  type CustomApiLookupResult,
  customApiLookupService,
  type CustomApiStoredRecord,
  type LookupField,
  type LookupRun,
  type LookupSurface,
  type RunnableLookup,
} from './services/customApiLookup.service';
export {
  type AdminCustomApiTemplate,
  type CustomApiTemplate,
  customApiTemplateAdminService,
  customApiTemplateService,
  type TemplateChecklistItem,
  type TemplateDefinition,
  type TemplateLookup,
} from './services/customApiTemplates.service';
