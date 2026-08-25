import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Laptop, LogOut, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { describeUserAgent } from '@/lib/userAgentLabel';
import { sessionsService, type ActiveSession } from '@/services/sessions.service';

/** What the confirm dialog is currently asking about. `null` = nothing is being confirmed. */
type Pending = { kind: 'one'; session: ActiveSession } | { kind: 'all' } | null;

const relative = (iso: string): string => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'unknown';
  return formatDistanceToNow(at, { addSuffix: true });
};

/**
 * The devices signed in to this account, and the two ways to end them.
 *
 * This is the surface that makes per-session revocation real. The backend has been able to
 * revoke one device for a while, but with nothing rendering the list there was no way for a
 * person to notice a session they did not recognise, let alone end it — the only control anyone
 * could reach was "change your password", which signs out everything.
 */
export const ActiveSessionsSettings = () => {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  /**
   * The backend serving this workspace predates session tracking, so `/api/auth/sessions` is
   * simply not there.
   *
   * ⚠️ This is not hypothetical and not only a self-hosted concern: the frontend deploys on
   * merge while the backend ships on a release TAG, so there is always a window — hours or days
   * — where production runs this component against an API without the routes. Rendering a red
   * "Request failed with status code 404" to every user for the length of that window would be a
   * regression introduced by shipping in the safe order.
   */
  const [unsupported, setUnsupported] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setSessions(await sessionsService.list());
    } catch (err: unknown) {
      // 404 is the version skew above, not a failure — say nothing rather than alarm someone
      // about a feature their backend has not been given yet.
      if (getErrorStatus(err) === 404) {
        setUnsupported(true);
        return;
      }
      logger.error('Failed to load active sessions', err);
      setError(getApiErrorMessage(err) ?? 'Could not load your signed-in devices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revokeOne = async (session: ActiveSession) => {
    setBusyId(session.id);
    try {
      await sessionsService.revoke(session.id);
      // Revoking the CURRENT session ends this browser's own login. Say so by going to the login
      // screen rather than leaving a signed-out page that fails on its next request.
      if (session.isCurrent) {
        window.location.href = '/login';
        return;
      }
      setSessions((current) => current.filter((row) => row.id !== session.id));
    } catch (err: unknown) {
      logger.error('Failed to revoke session', err);
      setError(getApiErrorMessage(err) ?? 'Could not sign that device out. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const logoutEverywhere = async () => {
    try {
      await sessionsService.logoutEverywhere();
    } catch (err: unknown) {
      // The request may well have succeeded before the response failed to arrive, and the cookies
      // are gone either way — so still leave, rather than stranding the user on a dead page.
      logger.error('logout-all failed', err);
    }
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!unsupported && (
        <p className="text-sm text-muted-foreground">
          Every browser and device currently signed in to your account. Signing one out ends it
          immediately — its next request is refused and any live connection is dropped.
        </p>
      )}

      {error && (
        <div className="flex gap-2 items-start p-3 text-sm text-red-700 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900">
          <ShieldAlert className="mt-0.5 w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {unsupported ? (
        <p className="text-sm text-muted-foreground">
          Signing out individual devices needs a newer version of the server than this workspace
          is running. It will appear here after the next update.
        </p>
      ) : sessions.length === 0 ? (
        // Not the same as "you are signed out" — a session opened before this feature shipped
        // has no row to show. Say what is true rather than implying something is wrong.
        <p className="text-sm text-muted-foreground">
          No signed-in devices are being tracked for this account yet. New sign-ins will appear
          here.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {sessions.map((session) => (
            <li key={session.id} className="flex gap-3 justify-between items-center py-3">
              <div className="flex gap-3 items-center min-w-0">
                <Laptop className="w-5 h-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex gap-2 items-center">
                    <span className="font-medium truncate">
                      {describeUserAgent(session.userAgent)}
                    </span>
                    {session.isCurrent && (
                      <span className="px-2 py-0.5 text-xs font-medium text-green-700 rounded-full bg-green-100 dark:bg-green-900/40 dark:text-green-300">
                        This device
                      </span>
                    )}
                  </div>
                  <div className="text-xs truncate text-muted-foreground">
                    {session.ipAddress ?? 'IP unknown'} · last active {relative(session.lastUsedAt)}{' '}
                    · signed in {relative(session.createdAt)}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busyId === session.id}
                onClick={() => setPending({ kind: 'one', session })}
              >
                {busyId === session.id ? 'Signing out…' : 'Sign out'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Not rendered on an older backend: `logout-all` is one of the routes that is not there,
          so the button could only ever fail. ⚠️ NOT `className="hidden"` — a CSS-hidden button is
          still in the DOM, still focusable and still clickable by keyboard. A test caught that. */}
      {!unsupported && (
        <div className="pt-2">
          <Button variant="destructive" size="sm" onClick={() => setPending({ kind: 'all' })}>
            <LogOut className="mr-2 w-4 h-4" />
            Log out everywhere
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Ends every session including this one. Use it if you think someone else has access to
            your account.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        variant="danger"
        title={pending?.kind === 'all' ? 'Log out everywhere?' : 'Sign this device out?'}
        description={
          pending?.kind === 'all'
            ? 'Every device, including this one, will be signed out and you will need to log in again.'
            : pending?.kind === 'one' && pending.session.isCurrent
              ? 'This is the device you are using now — you will be returned to the login screen.'
              : `${pending?.kind === 'one' ? describeUserAgent(pending.session.userAgent) : 'That device'} will be signed out immediately.`
        }
        confirmText={pending?.kind === 'all' ? 'Log out everywhere' : 'Sign out'}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (target?.kind === 'all') void logoutEverywhere();
          else if (target?.kind === 'one') void revokeOne(target.session);
        }}
      />
    </div>
  );
};
