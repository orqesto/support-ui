/** The bell's shared (sharedFetch) read of the signed-in user's settings; per workspace. */
export const NOTIFICATION_PREFS_KEY = 'notification-settings:me';
export const notificationPrefsFetchKey = (orgKey: number | string | null): string =>
  `${NOTIFICATION_PREFS_KEY}:${String(orgKey)}`;
