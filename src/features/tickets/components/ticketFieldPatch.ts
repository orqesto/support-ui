import type { UpdateTicketRequest } from '@/types';

/**
 * The PATCH body for one edited ticket field. The category select's "None" option has the
 * value `''`; it used to become `categoryId: undefined`, which JSON.stringify drops, so the
 * body was `{}` and the backend kept the old category while the select showed None (FE audit
 * 2026-09-29, A-H3). The backend clears a field on `null` and leaves it on `undefined`, so
 * "None" must send `null`.
 */
export const ticketFieldPatch = (field: string, value: string): UpdateTicketRequest => {
  if (field === 'categoryId') return { categoryId: value ? parseInt(value, 10) : null };
  return { [field]: value } as UpdateTicketRequest;
};
