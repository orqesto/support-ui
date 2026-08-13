import { useEffect, useState } from 'react';
import { gmailOAuthService } from '@/services/gmail-oauth.service';

/**
 * Gmail OAuth is Enterprise-only pre-CASA (Google shows an "unverified app" warning and
 * caps the app at ~100 OAuth users without CASA). The BE reports availability so the UI can
 * hide the Add-Gmail card for regular clients (who connect via IMAP). Returns `null` until
 * known — callers should stay optimistic and only hide on an explicit `false` (the BE 403
 * is the real enforcement). See canUseGmailOAuth on the BE.
 */
export const useGmailOAuthAvailability = (): boolean | null => {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    gmailOAuthService
      .getConfig()
      .then((res) => {
        if (active && res.success && res.data) setAvailable(res.data.available ?? true);
      })
      .catch(() => {
        /* keep optimistic on error */
      });
    return () => {
      active = false;
    };
  }, []);
  return available;
};
