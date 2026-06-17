import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { useLicenseStatus } from '@/hooks/useLicenseStatus';

const DISMISSED_STORAGE_KEY = 'license-banner-dismissed-validatedAt';

/**
 * Renders only when:
 *   - viewer is a global admin (gated by useLicenseStatus)
 *   - license enforcement is on (status !== null)
 *   - daysLeft ≤ 30
 *   - AND (daysLeft ≤ 7 OR user hasn't dismissed this validation)
 *
 * Dismissal pegs the BE's `validatedAt` timestamp into localStorage. When
 * the BE re-validates (next 24h pass) it produces a new `validatedAt`, and
 * the banner reappears. At ≤7 days dismissal is ignored entirely — too
 * close to the cliff to silence.
 */
export const LicenseExpiryBanner = () => {
  const { data: status } = useLicenseStatus();
  const [dismissedAt, setDismissedAt] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(DISMISSED_STORAGE_KEY);
  });

  // When BE re-validates and produces a new validatedAt, drop a stale dismissal.
  useEffect(() => {
    if (!status) return;
    if (dismissedAt && dismissedAt !== status.validatedAt) {
      setDismissedAt(null);
      window.localStorage.removeItem(DISMISSED_STORAGE_KEY);
    }
  }, [status, dismissedAt]);

  if (!status) return null;
  if (status.daysLeft > 30) return null;

  // ≤7 days is non-dismissable. >7 days respects the dismissed state.
  if (status.daysLeft > 7 && dismissedAt === status.validatedAt) return null;

  const variant: 'warning' | 'danger' = status.daysLeft <= 7 ? 'danger' : 'warning';
  const expiresAt = new Date(status.expiresAt).toLocaleString();

  let message: string;
  if (status.daysLeft <= 1) {
    message = `URGENT: Server license for client "${status.clientId}" expires in ${status.daysLeft} day(s) at ${expiresAt}. The server will refuse to boot after that. Renew now.`;
  } else if (status.daysLeft <= 7) {
    message = `Server license for client "${status.clientId}" expires in ${status.daysLeft} day(s) at ${expiresAt}. Renew within the week to avoid downtime.`;
  } else {
    message = `Server license for client "${status.clientId}" expires in ${status.daysLeft} day(s) at ${expiresAt}. Plan to renew before expiry.`;
  }

  const handleDismiss = () => {
    setDismissedAt(status.validatedAt);
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, status.validatedAt);
  };

  return (
    <Alert variant={variant} className="mb-3">
      <div className="flex gap-3 items-start">
        <AlertTriangle className="flex-shrink-0 mt-0.5 w-5 h-5" />
        <AlertDescription className="flex-1">{message}</AlertDescription>
        {status.daysLeft > 7 && (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss until next validation"
            className="flex-shrink-0 text-current opacity-60 transition-opacity hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </Alert>
  );
};
