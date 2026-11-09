/** Where the lookup editor goes back to: Settings › Integrations › Custom APIs. */
export const CUSTOM_APIS_SETTINGS_PATH = '/settings#integrations/custom-apis';

/** The route pattern App.tsx mounts the lookup editor page on. */
export const CUSTOM_API_LOOKUP_ROUTE = '/settings/custom-apis/:connectionId/lookups/:lookupId';

/** `new` adds a lookup under the connection; a number edits that lookup. */
export const customApiLookupPath = (connectionId: number, lookupId: number | 'new'): string =>
  `/settings/custom-apis/${connectionId}/lookups/${lookupId}`;

/** Start a connection's lookups from a custom API template (spec CUSTOM-API-TEMPLATES). */
export const CUSTOM_API_TEMPLATE_ROUTE = '/settings/custom-apis/:connectionId/templates';
export const customApiTemplatePath = (connectionId: number): string =>
  `/settings/custom-apis/${connectionId}/templates`;
