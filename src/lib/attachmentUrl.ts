import { API_BASE_URL } from '@/lib/config';

/**
 * The url for an attachment the BROWSER loads itself — a thumbnail `<img src>`.
 *
 * ⛔ The workspace has to be IN THE URL, and this is the same defect support-service#773 fixed
 * for the image proxy, left behind on attachments. A browser-loaded url carries no axios
 * interceptor, so the `X-Organization-Context` header never goes with it — and for a GLOBAL
 * ADMIN that header is the org context's only carrier.
 *
 * The backend consequence is worse than a 400, because it is silent: `downloadAttachment` calls
 * `getOrganizationContext` purely for its binding side effect and discards the result, and that
 * function only binds when the org resolves non-null. For a header-less global admin it
 * resolves null, the tenant scope is never bound, the query runs against the SHARED database,
 * and under BYODB the row — which lives on the tenant database — is simply not found. A broken
 * thumbnail and a 404 that says nothing about databases.
 *
 * ⚠️ ONE builder, used by every browser-loaded call site. In the email renderer the same url
 * was built in two places and a one-character drift between them would have removed every
 * image from every email, silently; that is now a single function with a test that drifts the
 * two apart. Attachments get the same treatment before the second call site can diverge.
 *
 * With no workspace selected this falls back to the legacy shape rather than emitting
 * `organizations/undefined` — exactly as `proxyRemoteImages` does. The backend still resolves
 * that shape from the header for anyone who can send one, which covers every caller except the
 * one this exists for.
 */
export function attachmentDownloadUrl(
  attachmentId: number,
  organizationId?: number | null,
  apiBaseUrl: string = API_BASE_URL
): string {
  return typeof organizationId === 'number' && organizationId > 0
    ? `${apiBaseUrl}/api/organizations/${organizationId}/attachments/${attachmentId}/download`
    : `${apiBaseUrl}/api/attachments/${attachmentId}/download`;
}
