import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { apiErrorMessage } from '@/lib/apiError';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { assignmentService } from '@/services/assignment.service';
import { listEntryVersions, restoreEntryVersion } from '@/services/kbEngine.service';
import type { KbEntryVersion, KbRestoreRefusal } from '@/services/kbEngine.types';
import { useAuthStore } from '@/stores/authStore';
import { formatWhen } from '../autoActions/kbAutoFormat';
import { ACTOR_LABEL, restoreRefusalText, versionReasonText } from '../activity/kbActivityCopy';

export const TEXT_REMOVED = 'Text removed (personal data)';

/** Names of the people in the history: one read of the workspace's users, only when needed. */
const usePeopleNames = (versions: KbEntryVersion[] | null): Map<number, string> => {
  const me = useAuthStore((state) => state.user);
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const ids = [
    ...new Set(
      (versions ?? [])
        .filter((version) => version.actorKind === 'person' && version.actorUserId !== null)
        .map((version) => version.actorUserId as number)
    ),
  ];
  const key = ids.join(',');
  useEffect(() => {
    if (!key) return;
    let live = true;
    assignmentService.getAssignableUsers().then(
      (users) => {
        if (!live) return;
        const next = new Map<number, string>();
        for (const user of users)
          next.set(user.id, `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim());
        setNames(next);
      },
      (error: unknown) => logger.warn('[KB] Could not resolve the history names', error)
    );
    return () => {
      live = false;
    };
  }, [key]);
  return me ? new Map([...names, [me.id, 'You']]) : names;
};

/** Is this the entry as it is now (nothing to restore)? */
const isLatest = (versions: KbEntryVersion[], version: KbEntryVersion) =>
  versions[versions.length - 1]?.version === version.version;

/**
 * The entry's history (who: a person by name / Engine / System; when; why, in plain words) with
 * "Restore this version". A version whose text was removed (it held personal data) cannot be
 * restored. A refusal is shown in plain words; "Include later changes" is offered only when the
 * refusal is about later changes. Read only when opened.
 */
export const KbEntryVersions = ({
  entryId,
  canRestore,
  onRestored,
}: {
  entryId: number;
  canRestore: boolean;
  onRestored: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<KbEntryVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [refusal, setRefusal] = useState<{ version: number; refusal: KbRestoreRefusal } | null>(
    null
  );
  const names = usePeopleNames(versions);

  const read = () => {
    setError(null);
    listEntryVersions(entryId).then(setVersions, (err: unknown) => {
      logger.error('Failed to read the entry history:', err);
      setVersions([]);
      setError(apiErrorMessage(err, 'Could not read the history.'));
    });
  };

  useEffect(() => {
    setOpen(false);
    setVersions(null);
    setRefusal(null);
  }, [entryId]);

  const restore = async (version: number, includeLater = false) => {
    setBusy(version);
    setRefusal(null);
    try {
      const result = await restoreEntryVersion(entryId, version, includeLater);
      if (result.refused) {
        setRefusal({ version, refusal: result });
        return;
      }
      toast.success(result.unchanged ? 'Already as it was then' : `Restored version ${version}`);
      read();
      onRestored();
    } catch (err) {
      toast.error('Could not restore', { description: apiErrorMessage(err, 'Please try again.') });
    } finally {
      setBusy(null);
    }
  };

  const who = (version: KbEntryVersion): string =>
    version.actorKind === 'person'
      ? (version.actorUserId !== null && names.get(version.actorUserId)) || ACTOR_LABEL.person
      : ACTOR_LABEL[version.actorKind];

  if (!open)
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          read();
        }}
      >
        <History className="mr-2 w-4 h-4" aria-hidden="true" />
        Version history
      </Button>
    );

  return (
    <section className="space-y-2" aria-label="Version history" data-testid="kb-entry-versions">
      <h3 className="text-lg font-semibold font-display">Version history</h3>
      {error && (
        <Alert variant="warning" className="py-2 text-sm">
          {error}
        </Alert>
      )}
      {versions === null ? (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      ) : versions.length === 0 ? (
        !error && <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
      ) : (
        <ol className="space-y-2">
          {[...versions].reverse().map((version) => {
            const redacted = version.snapshot.textRedacted === true;
            const shownRefusal = refusal?.version === version.version ? refusal.refusal : null;
            return (
              <li
                key={version.version}
                className="p-3 space-y-1 text-sm rounded-lg border"
                data-testid="kb-entry-version"
              >
                <div className="flex flex-wrap gap-2 justify-between items-center">
                  <span className="font-medium">
                    v{version.version} · {who(version)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatWhen(version.createdAt)}
                  </span>
                </div>
                <p className="text-muted-foreground">{versionReasonText(version.reason)}</p>
                {redacted && <Badge variant="secondary">{TEXT_REMOVED}</Badge>}
                {canRestore && !redacted && !isLatest(versions, version) && (
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={busy === version.version}
                    disabled={busy !== null}
                    onClick={() => void restore(version.version)}
                  >
                    Restore this version
                  </Button>
                )}
                {shownRefusal && (
                  <div data-testid="kb-restore-refusal">
                    <Alert variant="warning" className="py-2 text-sm">
                      <p>{restoreRefusalText(shownRefusal)}</p>
                      {shownRefusal.refused === 'later_changes' && (
                        <div className="flex flex-wrap gap-2 items-center mt-2">
                          <span>Restore anyway and undo the later changes too?</span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy !== null}
                            onClick={() => void restore(version.version, true)}
                          >
                            Include later changes
                          </Button>
                        </div>
                      )}
                    </Alert>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
