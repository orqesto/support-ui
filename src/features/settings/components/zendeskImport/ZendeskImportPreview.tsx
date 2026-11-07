import { Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSerialOptionSaves } from './useSerialOptionSaves';
import { ZENDESK_AS_THREADS, summarizePreview } from './zendeskImportSummary';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { apiErrorMessage } from '@/lib/apiError';
import { toast } from '@/lib/toast';
import { departmentService } from '@/services/department.service';
import { integrationsService } from '@/services/integrations.service';
import { userService } from '@/services/user.service';
import { zendeskImportService, type ZendeskRun } from '@/services/zendeskImport.service';
import type { Department } from '@/types';

type Props = {
  run: ZendeskRun;
  onRunChange: (run: ZendeskRun) => void;
  onAct: (action: () => Promise<unknown>, failure: string) => Promise<void>;
};

/**
 * Mailbox types a reply can leave through: every mail source type the backend has. An IMAP/SMTP
 * mailbox is type `email` ("imap" is only a sync-channel label, never a source type), Gmail is
 * `gmail`; the backend's own mail paths filter on exactly these two.
 */
export const MAIL_SOURCE_TYPES = new Set(['email', 'gmail']);

/** How long the CSV's object URL lives after the click: revoking at once cancels some downloads. */
const REVOKE_AFTER_MS = 1000;

export const downloadConflicts = async (runId: number): Promise<void> => {
  const blob = await zendeskImportService.conflictsCsv(runId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `zendesk-import-${runId}-conflicts.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
};

/** What the import will do, and the choices that change it. Nothing is written until Import. */
export const ZendeskImportPreview = ({ run, onRunChange, onAct }: Props) => {
  const preview = run.preview;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [mailboxes, setMailboxes] = useState<Array<{ value: string; label: string }>>([]);
  const [people, setPeople] = useState<Array<{ value: string; label: string }>>([]);
  const [confirmApply, setConfirmApply] = useState(false);
  const { save, saving } = useSerialOptionSaves(run, onRunChange);
  /**
   * "Import spam" changes which follow-ups join a thread (a follow-up of a skipped spam ticket
   * has no thread to join), and only the server can count that — so the export is checked again.
   * Set while that check could not be started: the numbers on screen are from before the change.
   */
  const [stale, setStale] = useState(false);
  /** A new check is being started: a second spam flip now would be refused (409) by the server. */
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    departmentService
      .getAll()
      .then(setDepartments)
      .catch(() => setDepartments([]));
    integrationsService
      .getAll()
      .then((res) =>
        setMailboxes(
          (res.data ?? [])
            .filter((source) => MAIL_SOURCE_TYPES.has(source.type))
            .map((source) => ({ value: String(source.id), label: source.name }))
        )
      )
      .catch(() => setMailboxes([]));
    userService
      .getAllPages()
      .then((res) =>
        setPeople(
          res.data.map((user) => ({
            value: String(user.id),
            label: `${[user.firstName, user.lastName].filter(Boolean).join(' ')} (${user.email})`,
          }))
        )
      )
      .catch(() => setPeople([]));
  }, []);

  const options = run.options;
  const summary = useMemo(
    () => (preview ? summarizePreview(preview.counts, options, preview.tickets) : null),
    [preview, options]
  );
  if (!preview || !summary) return null;

  const departmentOptions = departments.map((dept) => ({
    value: String(dept.id),
    label: dept.name,
  }));
  const recheck = async () => {
    setChecking(true);
    try {
      await onAct(() => zendeskImportService.preview(run.id), 'Could not start the check');
    } finally {
      setChecking(false);
    }
  };
  const toggleSpam = async (next: boolean) => {
    if (!(await save(() => ({ includeSpam: next })))) return;
    // Until the new check starts the numbers are stale. Once it starts this screen is replaced by
    // its progress; if it cannot start, the warning below stays and Import waits for a check.
    setStale(true);
    await recheck();
  };
  const unmatched = Object.entries(preview.assignees).filter(
    ([, info]) => info.odlyUserId === null
  );
  const notOurs = Object.entries(preview.toAddresses).filter(([, info]) => !info.ours);

  return (
    <div className="space-y-5">
      <section className="space-y-1">
        <h3 className="font-semibold">What will happen</h3>
        <ul className="space-y-1">
          <li>{preview.tickets.toLocaleString()} tickets in the export</li>
          <li>
            <strong>{summary.created.toLocaleString()}</strong> become new threads
          </li>
          <li>
            <strong>{summary.joined.toLocaleString()}</strong> join a thread already in Odly (the
            same email, a follow-up, or an earlier import) — no second copy is made
          </li>
          {summary.unchanged > 0 && (
            <li>{summary.unchanged.toLocaleString()} are unchanged since the last import</li>
          )}
          {summary.deletedInOdly > 0 && (
            <li>{summary.deletedInOdly.toLocaleString()} deleted in Odly — skipped</li>
          )}
          {summary.skippedSpam > 0 && (
            <li>{summary.skippedSpam.toLocaleString()} closed as spam by Zendesk are skipped</li>
          )}
        </ul>
        {preview.unreadableLines > 0 && (
          <Alert variant="warning">
            {preview.unreadableLines.toLocaleString()} lines of the file could not be read — the
            file may be cut short. Upload it again if the ticket count looks low.
          </Alert>
        )}
        {summary.conflicts > 0 && (
          <Alert variant="warning">
            <span>
              {summary.conflicts.toLocaleString()} tickets match more than one Odly thread and are
              not imported.{' '}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void downloadConflicts(run.id).catch((error: unknown) =>
                  toast.error(apiErrorMessage(error, 'Download failed'))
                )
              }
            >
              <Download className="mr-1 w-4 h-4" />
              List (CSV)
            </Button>
          </Alert>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Choices</h3>
        <Toggle
          checked={options.includeSpam}
          onChange={(next) => void toggleSpam(next)}
          disabled={saving || checking}
          label={`Also import tickets Zendesk closed as spam (${(preview.counts.spamClosed ?? 0).toLocaleString()}) — the export is checked again to update the numbers`}
        />
        {summary.probable > 0 && (
          <Toggle
            checked={options.includeProbable}
            onChange={(next) => void save(() => ({ includeProbable: next }))}
            disabled={saving}
            label={`Join ${summary.probable.toLocaleString()} tickets to a thread with the same sender and subject from the same minutes (otherwise they become new threads)`}
          />
        )}
        {Object.keys(preview.groups).length > 0 && (
          <div className="space-y-2">
            <Label>Team for each Zendesk group</Label>
            {Object.entries(preview.groups).map(([group, tickets]) => (
              <div key={group} className="grid grid-cols-1 gap-2 items-center sm:grid-cols-2">
                <span>
                  {group} <Badge variant="secondary">{tickets.toLocaleString()}</Badge>
                </span>
                <Select
                  size="sm"
                  options={departmentOptions}
                  value={
                    options.groupDepartments[group] ? String(options.groupDepartments[group]) : ''
                  }
                  aria-label={`Team for ${group}`}
                  placeholder="By the mailbox it was sent to"
                  clearable
                  disabled={saving}
                  onChange={(value: string) =>
                    void save((current) => {
                      const next = { ...current.groupDepartments };
                      if (value) next[group] = Number(value);
                      else delete next[group];
                      return { groupDepartments: next };
                    })
                  }
                />
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Team when nothing else decides"
            size="sm"
            options={departmentOptions}
            value={options.defaultDepartmentId ? String(options.defaultDepartmentId) : ''}
            placeholder="Your first team"
            clearable
            disabled={saving}
            onChange={(value: string) =>
              void save(() => ({ defaultDepartmentId: value ? Number(value) : null }))
            }
          />
          <Select
            label="Mailbox replies go out from, for web-form tickets"
            size="sm"
            options={mailboxes}
            value={options.defaultSourceId ? String(options.defaultSourceId) : ''}
            placeholder="The team's mailbox"
            clearable
            disabled={saving}
            onChange={(value: string) =>
              void save(() => ({ defaultSourceId: value ? Number(value) : null }))
            }
          />
        </div>
        {unmatched.length > 0 && (
          <div className="space-y-2">
            <Label>Odly person for each Zendesk agent</Label>
            <p className="text-muted-foreground">
              No Odly account has these Zendesk addresses. Choose who each one is in Odly, or their
              tickets come in unassigned. Tickets already in Odly get the person only where nobody
              has worked on the thread in Odly.
            </p>
            {unmatched.map(([email, info]) => (
              <div key={email} className="grid grid-cols-1 gap-2 items-center sm:grid-cols-2">
                <span>
                  {email} <Badge variant="secondary">{info.count.toLocaleString()}</Badge>
                </span>
                <Select
                  size="sm"
                  options={people}
                  value={options.agentUsers[email] ? String(options.agentUsers[email]) : ''}
                  aria-label={`Odly person for ${email}`}
                  placeholder="Unassigned"
                  clearable
                  disabled={saving}
                  onChange={(value: string) =>
                    void save((current) => {
                      const next = { ...current.agentUsers };
                      if (value) next[email] = Number(value);
                      else delete next[email];
                      return { agentUsers: next };
                    })
                  }
                />
              </div>
            ))}
          </div>
        )}
        {notOurs.length > 0 && (
          <p className="text-muted-foreground">
            Sent to addresses that are not a mailbox in Odly:{' '}
            {notOurs.map(([address]) => address).join(', ')}. Those tickets use the team's mailbox
            for replies.
          </p>
        )}
      </section>

      {stale && (
        <Alert variant="warning">
          <span>
            These numbers are from before the spam choice changed. Check again to update them before
            importing.{' '}
          </span>
          <Button variant="outline" size="sm" onClick={() => void recheck()} disabled={checking}>
            Check again
          </Button>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setConfirmApply(true)} disabled={saving || stale || checking}>
          Import {(summary.created + summary.joined).toLocaleString()} tickets
        </Button>
      </div>

      <ConfirmDialog
        open={confirmApply}
        onOpenChange={setConfirmApply}
        variant="info"
        title="Import these tickets?"
        description={`${summary.created.toLocaleString()} new threads and ${summary.joined.toLocaleString()} updated ones. ${ZENDESK_AS_THREADS} Nothing is sent to customers or agents. Importing the same account again later only adds what changed.`}
        confirmText="Import"
        onConfirm={() =>
          void onAct(() => zendeskImportService.apply(run.id), 'Could not start the import')
        }
      />
    </div>
  );
};
