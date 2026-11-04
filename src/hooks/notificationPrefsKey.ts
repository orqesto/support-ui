/** The bell's shared (sharedFetch) read of the signed-in user's settings; per workspace. */
export const NOTIFICATION_PREFS_KEY = 'notification-settings:me';
export const notificationPrefsFetchKey = (orgKey: number | string | null): string =>
  `${NOTIFICATION_PREFS_KEY}:${String(orgKey)}`;

/**
 * Fired on `window` after the signed-in user's notification settings were saved or reset. A
 * change of a kind, "only mine" or the minimum priority changes WHICH rows the bell may count,
 * so the bell's lists re-read (the server applies the lines; the client cannot recount them).
 */
export const NOTIFICATION_SETTINGS_CHANGED_EVENT = 'odly:notification-settings-changed';
export const announceNotificationSettingsChanged = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_CHANGED_EVENT));
  }
};
