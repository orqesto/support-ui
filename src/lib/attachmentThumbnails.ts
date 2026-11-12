import { apiClient } from '@/lib/api-client';
import { clearOnSessionChange } from './sessionCaches';

/*
  Image thumbnails of attachments (the ticket Files list), as blob URLs (the download route needs the auth header,
  so an <img src> cannot fetch it). Fetched once per file and held here: the Files list re-read on
  every `ticket:comments:updated` and on every return to the ticket, and each re-read downloaded
  every image again, one after another.

  At most MAX_HELD images (the least recently used is revoked), all revoked on sign-out and on a
  workspace switch (sessionCaches). A URL is revoked only when it leaves the cache; an <img> already showing it keeps its
  decoded picture.
*/

const MAX_HELD = 60;
const held = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

type ThumbnailSource = { id: number; mimeType: string; url: string; externalId?: string | null };

const isJira = (attachment: ThumbnailSource): boolean =>
  !!attachment.externalId && attachment.url.startsWith('http');
/** One file's place in the cache (a Jira attachment and ours can share an id). */
const keyOf = (attachment: ThumbnailSource): string =>
  `${isJira(attachment) ? 'jira' : 'own'}:${attachment.id}`;

const images = <T extends ThumbnailSource>(attachments: readonly T[]) =>
  attachments.filter((attachment) => attachment.mimeType.startsWith('image/'));

const remember = (key: string, url: string) => {
  held.delete(key);
  held.set(key, url);
  while (held.size > MAX_HELD) {
    const [oldestKey, oldestUrl] = held.entries().next().value as [string, string];
    held.delete(oldestKey);
    URL.revokeObjectURL(oldestUrl);
  }
};

/** The thumbnails already held for these attachments, by attachment id. */
export const heldThumbnails = (attachments: readonly ThumbnailSource[]): Record<number, string> => {
  const urls: Record<number, string> = {};
  for (const attachment of images(attachments)) {
    const url = held.get(keyOf(attachment));
    if (url) urls[attachment.id] = url;
  }
  return urls;
};

const fetchOne = (attachment: ThumbnailSource): Promise<string | null> => {
  const key = keyOf(attachment);
  const running = inFlight.get(key);
  if (running) return running;
  // Spelled out here: the path check (servicePathsCarryApiPrefix) reads the literal.
  const path = isJira(attachment)
    ? `/api/attachments/jira/${attachment.id}/download`
    : `/api/attachments/${attachment.id}/download`;
  const request = apiClient
    .get(path, { responseType: 'blob' })
    .then((response) => {
      const url = URL.createObjectURL(response.data as Blob);
      remember(key, url);
      return url;
    })
    // A thumbnail that fails is not fatal: the file icon renders instead.
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
};

/**
 * Every image's thumbnail, fetching only those not held yet (one at a time, as before — a ticket
 * with many images must not open dozens of downloads at once).
 */
export const loadThumbnails = async (
  attachments: readonly ThumbnailSource[]
): Promise<Record<number, string>> => {
  const urls: Record<number, string> = {};
  for (const attachment of images(attachments)) {
    const url = held.get(keyOf(attachment)) ?? (await fetchOne(attachment));
    if (url) urls[attachment.id] = url;
  }
  return urls;
};

/** Sign-out, a workspace switch (sessionCaches), and tests. */
export const forgetThumbnails = (): void => {
  for (const url of held.values()) URL.revokeObjectURL(url);
  held.clear();
  inFlight.clear();
};

clearOnSessionChange(forgetThumbnails);
