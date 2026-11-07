import { getErrorBody, getErrorStatus } from '@/lib/errorMessages';

/**
 * Is this the answer of a backend that does not have an `/api/organizations/<name>` route yet?
 * Not only a 404: a release without it matches the path against `/api/organizations/:id` instead,
 * which answers an org admin 403 "Global admin access required" (its `requireGlobalAdmin`) and a
 * global admin 400 "Invalid organization ID" (`getById`). Matched on the exact messages, so a real
 * refusal still shows.
 */
export const isRouteMissing = (err: unknown): boolean => {
  const status = getErrorStatus(err);
  if (status === 404) return true;
  const message = getErrorBody(err)?.error;
  return (
    (status === 403 && message === 'Global admin access required') ||
    (status === 400 && message === 'Invalid organization ID')
  );
};
