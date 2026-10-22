import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import {
  departmentService,
  isTeamsSwitchStillRunning,
  labelForTeamsOffCount,
  type TeamsOffPreview,
} from '@/services/department.service';

const describeError = (err: unknown, fallback: string): string =>
  getApiErrorMessage(err) ?? fallback;

/**
 * "Use teams" → off. Reads the preview first, so the admin sees what moves before confirming.
 */
export const TeamsOffDialog = ({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) => {
  const [preview, setPreview] = useState<TeamsOffPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The PUT got no answer, or the backend says a switch-off is already running: wait for it.
  const [stillSwitching, setStillSwitching] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setLoadError(null);
    setSaveError(null);
    departmentService
      .previewTeamsOff()
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err: unknown) => {
        logger.error('Failed to load the teams-off preview:', err);
        if (!cancelled) setLoadError(describeError(err, 'Could not load what would move.'));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const confirm = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await departmentService.setTeamsMode(false);
      await onDone();
    } catch (err) {
      if (!isTeamsSwitchStillRunning(err)) {
        logger.error('Failed to switch teams off:', err);
        setSaveError(describeError(err, 'Could not switch teams off. Try again.'));
        return;
      }
      // Still running on the server: never report a failure while it may yet succeed.
      setStillSwitching(true);
      const final = await departmentService.waitForTeamsSwitch();
      setStillSwitching(false);
      if (final.interrupted) {
        setSaveError(
          "Switching teams off didn't finish. Press Switch teams off again to finish it."
        );
      } else if (final.switching) {
        setSaveError(
          'Teams are still being switched off. This page will show the result once it finishes; check again in a few minutes.'
        );
      } else if (!final.teamsEnabled) {
        await onDone();
      } else {
        setSaveError('Teams were not switched off. Try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const defaultName = preview?.defaultDepartment?.name ?? '';
  const target = defaultName === '' ? 'the default team' : defaultName;
  // Zero rows say nothing; the backend sends every key.
  const counts = Object.entries(preview?.counts ?? {}).filter(([, value]) => value > 0);
  const stays = preview?.staysWithTeam ?? [];
  // What comes back with a team switched on again: what stays with it (BE: routing rules and
  // AI prompt templates, plus twins the default team already has).
  const staysText = `its ${(stays.length === 0
    ? ['routingRules', 'promptTemplates']
    : stays.map((item) => item.key)
  )
    .map((key) => labelForTeamsOffCount(key).toLowerCase())
    .join(', ')}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Switch teams off?</DialogTitle>
          <DialogClose onClose={() => !saving && onClose()} />
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {loadError ? (
            <Alert variant="danger">
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : !preview ? (
            <div className="flex gap-2 items-center text-muted-foreground">
              <Spinner /> Checking what would move…
            </div>
          ) : (
            <>
              <p>
                {preview.teamsToMerge === 0
                  ? `There are no other teams. Everything is already in ${target}.`
                  : `${preview.teamsToMerge} ${preview.teamsToMerge === 1 ? 'team' : 'teams'} will be merged into ${target}. This moves:`}
              </p>
              {preview.blockers.length > 0 && (
                <Alert variant="danger">
                  <AlertTitle>Teams can’t be switched off yet</AlertTitle>
                  <AlertDescription>
                    <ul className="pl-4 mt-1 space-y-1 list-disc" aria-label="What stops it">
                      {preview.blockers.map((blocker, index) => (
                        <li
                          key={`${blocker.kind}-${blocker.teamId ?? index}-${blocker.integrationName}`}
                        >
                          {blocker.kind === 'ticketingIntegration'
                            ? `Team ${blocker.teamName} has its own ticket system connection ${blocker.integrationName}; remove or move it before switching teams off.`
                            : `Team ${blocker.teamName} has ${blocker.integrationName || 'something'} that must be removed or moved first.`}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              {preview.inactiveTeamsSwept > 0 && (
                <p>
                  What{' '}
                  {preview.inactiveTeamsSwept === 1
                    ? '1 team'
                    : `${preview.inactiveTeamsSwept} teams`}{' '}
                  already switched off still hold moves to {target} too.
                </p>
              )}
              {counts.length > 0 && (
                <ul className="space-y-1" aria-label="What moves">
                  {counts.map(([key, value]) => (
                    <li key={key} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{labelForTeamsOffCount(key)}</span>
                      <span className="font-medium tabular-nums">{value.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
              {stays.length > 0 && (
                <div>
                  <p>These stay with each team and are not moved:</p>
                  <ul className="mt-1 space-y-1" aria-label="What stays with each team">
                    {stays.map((item) => (
                      <li key={item.key} className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          {labelForTeamsOffCount(item.key)}
                        </span>
                        {item.count !== undefined && (
                          <span className="font-medium tabular-nums">
                            {item.count.toLocaleString()}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Object.entries(preview.mergedIntoSameName).some(([, value]) => value > 0) && (
                <p>
                  {Object.entries(preview.mergedIntoSameName)
                    .filter(([, value]) => value > 0)
                    .map(([key, value]) => {
                      const words = labelForTeamsOffCount(key).toLowerCase();
                      // 1 category, 1 label — not "1 categories".
                      const one = words.replace(/ies$/, 'y').replace(/s$/, '');
                      return `${value.toLocaleString()} ${value === 1 ? one : words}`;
                    })
                    .join(' and ')}{' '}
                  with the same name as one in {target} are merged into it.
                </p>
              )}
              {preview.leadQualificationMovesToDefault && (
                <p data-testid="teams-off-lead-qualification">
                  Lead qualification will run on {target}, so on all your mail.
                </p>
              )}
              {preview.membersAddedToDefault > 0 && (
                <p>
                  {preview.membersAddedToDefault.toLocaleString()}{' '}
                  {preview.membersAddedToDefault === 1 ? 'person is' : 'people are'} added to{' '}
                  {target}, so they see its threads.
                </p>
              )}
            </>
          )}

          <Alert variant="warning">
            <AlertTitle>This can’t be undone</AlertTitle>
            <AlertDescription>
              <ul className="pl-4 mt-1 space-y-1 list-disc">
                <li>Everything that moves stays in {target}, even if you switch teams on again.</li>
                <li>Agents who could see only their own team will see everything.</li>
                <li>
                  A team you switch on again later comes back with {staysText}, but with no threads,
                  tickets or knowledge base entries.
                </li>
              </ul>
            </AlertDescription>
          </Alert>

          {stillSwitching && (
            <div className="flex gap-2 items-center text-muted-foreground" role="status">
              <Spinner /> Still switching teams off. This can take a few minutes; keep this open.
            </div>
          )}

          {saveError && (
            <Alert variant="danger">
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void confirm()}
            isLoading={saving}
            disabled={saving || !preview || preview.blockers.length > 0}
          >
            Switch teams off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
