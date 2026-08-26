/**
 * One "Received at" option, and the normalisation that makes two wire shapes into one.
 *
 * The backend answers `string[]` by default and a richer object list under `detailed=1`,
 * which an older backend simply ignores. Both land here rather than at the render site:
 * the frontend deploys on merge while the backend ships on a tag, so the two shapes
 * coexist in production for real, and a field the caller does not defend becomes a white
 * screen the first time a deploy lands out of order.
 */

export type ReceivedAtOption = {
  address: string;
  /**
   * The mailbox is configured with this address, or has declared it as an alias.
   * These lead the list — a real workspace's ten aliases were otherwise buried among
   * eighty-eight customer addresses that had merely been cc'd or replied to.
   */
  ours: boolean;
  conversations: number;
  /**
   * How many of those conversations our OWN receiving server recorded this address
   * accepting — the one recipient field a sender cannot influence. Zero means it was
   * only ever seen in To/Cc, which is the sender's claim. An address with volume and no
   * deliveries is a correspondent; one with deliveries is a mailbox of ours.
   */
  deliveredConversations: number;
};

const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Accepts either wire shape; drops anything without a usable address. */
export const normaliseReceivedAtOptions = (rows: unknown): ReceivedAtOption[] => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row): ReceivedAtOption => {
      if (typeof row === 'string') {
        return { address: row, ours: false, conversations: 0, deliveredConversations: 0 };
      }
      const raw = (row ?? {}) as Record<string, unknown>;
      return {
        address: asString(raw.address),
        ours: raw.ours === true,
        conversations: asNumber(raw.conversations),
        deliveredConversations: asNumber(raw.deliveredConversations),
      };
    })
    .filter((row) => row.address.length > 0);
};

/**
 * The trailing detail shown against an option.
 *
 * Empty when the backend predates `detailed=1` and reports no counts, so an older deploy
 * shows a plain list rather than "0" against every address.
 */
export const describeReceivedAt = (option: ReceivedAtOption): string | undefined => {
  if (option.conversations <= 0) return undefined;
  return option.deliveredConversations > 0
    ? `${option.conversations} · delivered`
    : `${option.conversations}`;
};
