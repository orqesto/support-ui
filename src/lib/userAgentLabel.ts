/**
 * Turn a stored User-Agent string into something a person can recognise in a device list.
 *
 * ⚠️ This is RECOGNITION, not identification. The string is self-reported by whatever signed in
 * and is trivially forged — it exists so someone scanning their sessions can tell "my laptop"
 * from "not my laptop", and for nothing else. Never branch on it for anything that matters.
 *
 * The parsing is deliberately shallow: no UA-parsing library, no version numbers, no model
 * detection. A wrong-but-confident "iPhone 14 Pro" is worse than "Safari on iPhone", because it
 * invites the reader to trust the row.
 */

const BROWSERS: Array<[RegExp, string]> = [
  // Order matters — every Chromium browser also says "Chrome", and Chrome also says "Safari".
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const PLATFORMS: Array<[RegExp, string]> = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

const firstMatch = (ua: string, table: Array<[RegExp, string]>): string | null =>
  table.find(([pattern]) => pattern.test(ua))?.[1] ?? null;

/**
 * A short label like `Chrome on Mac`. Falls back to the raw string (truncated) when nothing
 * matches, and to a plain "Unknown device" when there is nothing at all — an API client or a
 * session opened before user agents were recorded.
 */
export const describeUserAgent = (userAgent: string | null | undefined): string => {
  const ua = userAgent?.trim();
  if (!ua) return 'Unknown device';

  const browser = firstMatch(ua, BROWSERS);
  const platform = firstMatch(ua, PLATFORMS);

  if (browser && platform) return `${browser} on ${platform}`;
  if (browser) return browser;
  if (platform) return platform;

  // Something we do not recognise — a script, a mobile app, a bot. Show it rather than pretending
  // to know, but keep it short enough not to wreck the layout.
  return ua.length > 40 ? `${ua.slice(0, 40)}…` : ua;
};
