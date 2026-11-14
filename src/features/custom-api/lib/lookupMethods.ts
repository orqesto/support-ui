import type { RunnableLookup } from '@/features/custom-api/services/customApiLookup.service';

/**
 * The method and config version a newer backend reports per lookup (#920), read defensively: an
 * older backend sends neither, and then the Lookups tab does not run on its own (FE/BE skew rule).
 */
export const lookupMethodOf = (lookup: RunnableLookup): string | null => {
  const method = (lookup as { method?: unknown }).method;
  return typeof method === 'string' && method.trim() ? method.trim().toUpperCase() : null;
};
export const lookupConfigVersionOf = (lookups: RunnableLookup[]): string =>
  lookups
    .map((lookup) => {
      const updatedAt = (lookup as { updatedAt?: unknown }).updatedAt;
      return `${lookup.endpointId}:${typeof updatedAt === 'string' ? updatedAt : ''}`;
    })
    .sort()
    .join(',');
