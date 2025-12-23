/**
 * Common IMAP provider configurations
 * Auto-detects IMAP settings based on email domain
 */

export type ImapConfig = {
  host: string;
  port: number;
  secure: boolean;
};

const IMAP_PROVIDERS: Record<string, ImapConfig> = {
  'gmail.com': {
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
  },
  'googlemail.com': {
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
  },
  'outlook.com': {
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
  },
  'hotmail.com': {
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
  },
  'live.com': {
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
  },
  'yahoo.com': {
    host: 'imap.mail.yahoo.com',
    port: 993,
    secure: true,
  },
  'icloud.com': {
    host: 'imap.mail.me.com',
    port: 993,
    secure: true,
  },
  'me.com': {
    host: 'imap.mail.me.com',
    port: 993,
    secure: true,
  },
  'aol.com': {
    host: 'imap.aol.com',
    port: 993,
    secure: true,
  },
  'zoho.com': {
    host: 'imap.zoho.com',
    port: 993,
    secure: true,
  },
  'mail.ru': {
    host: 'imap.mail.ru',
    port: 993,
    secure: true,
  },
  'yandex.com': {
    host: 'imap.yandex.com',
    port: 993,
    secure: true,
  },
  'yandex.ru': {
    host: 'imap.yandex.ru',
    port: 993,
    secure: true,
  },
  'protonmail.com': {
    host: 'imap.protonmail.com',
    port: 993,
    secure: true,
  },
  'gmx.com': {
    host: 'imap.gmx.com',
    port: 993,
    secure: true,
  },
  'gmx.net': {
    host: 'imap.gmx.net',
    port: 993,
    secure: true,
  },
  'prefabhome.eu': {
    host: 'mail.frame-house.eu',
    port: 993,
    secure: true,
  },
};

/**
 * Extract domain from email address
 */
const extractDomain = (email: string): string | null => {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
};

/**
 * Auto-detect IMAP configuration based on email address
 * Returns null if provider is not recognized
 */
export const detectImapConfig = (email: string): ImapConfig | null => {
  const domain = extractDomain(email);
  if (!domain) {
    return null;
  }

  return IMAP_PROVIDERS[domain] || null;
};

/**
 * Check if email provider is supported for auto-configuration
 */
export const isProviderSupported = (email: string): boolean => {
  const domain = extractDomain(email);
  if (domain) {
    return domain in IMAP_PROVIDERS;
  }
  return false;
};

/**
 * Get list of supported email providers
 */
export const getSupportedProviders = (): string[] => Object.keys(IMAP_PROVIDERS).sort();
