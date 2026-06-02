export type DetectedBrowser = 'chrome' | 'firefox' | 'safari' | 'edge' | 'brave' | 'unknown';

export const detectBrowser = (): DetectedBrowser => {
  if (typeof navigator === 'undefined') return 'unknown';

  const nav = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } };
  if (nav.brave?.isBrave) return 'brave';

  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'safari';
  return 'unknown';
};

export const getPopupUnblockInstructions = (browser: DetectedBrowser): string => {
  switch (browser) {
    case 'chrome':
    case 'edge':
    case 'brave':
      return 'Click the popup-blocked icon at the right edge of the address bar, choose "Always allow popups from this site," then click Try the popup again.';
    case 'firefox':
      return 'A yellow notification bar should be at the top of the window. Click "Options" or "Preferences" → "Allow popups for this site," then click Try the popup again.';
    case 'safari':
      return 'Open Safari → Settings → Websites → Pop-up Windows, set this site to "Allow," then click Try the popup again.';
    default:
      return 'Check your browser address bar for a popup-blocked icon and allow popups for this site, then click Try the popup again.';
  }
};
