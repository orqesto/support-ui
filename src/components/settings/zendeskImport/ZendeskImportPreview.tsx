import { Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { summarizePreview } from './zendeskImportSummary';
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
import {
  zendeskImportService,
  type ZendeskImportOptions,
  type ZendeskRun,
} from '@/services/zendeskImport.service';
import type { Department } from '@/types';

type Props = {
  run: ZendeskRun;
  onRunChange: (run: ZendeskRun) => void;
  onAct: (action: () => Promise<unknown>, failure: string) => Promise<void>;
};

/** Mailbox types a reply can leave through. */
const MAIL_SOURCE_TYPES = new Set(['email', 'gmail']);

export const downloadConflicts = async (runId: number): Promise<void> => {
  const blob = await zendeskImportService.conflictsCsv(runId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `zendesk-import-${runId}-conflicts.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

/** What the import will do, and the choices that change it. Nothing is written until Import. */
export const ZendeskImportPreview = ({ run, onRunChange, onAct }: Props) => {
  const preview = run.preview;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [mailboxes, setMailboxes] = useState<Array<{ value: string; label: string }>>([]);
  const [confirmApply, setConfirmApply] = useState(false);
  const [saving, setSaving] = useState(false);

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
  const save = async (patch: Partial<ZendeskImportOptions>) => {
    setSaving(true);
    try {
      onRunChange(await zendeskImportService.updateOptions(run.id, patch));
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the choice'));
    } finally {
      setSaving(false);
    }
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
          onChange={(next) => void save({ includeSpam: next })}
          disabled={saving}
          label={`Also import tickets Zendesk closed as spam (${(preview.counts.spamClosed ?? 0).toLocaleString()})`}
        />
        {summary.probable > 0 && (
          <Toggle
            checked={options.includeProbable}
            onChange={(next) => void save({ includeProbable: next })}
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
                  onChange={(value: string) => {
                    const next = { ...options.groupDepartments };
                    if (value) next[group] = Number(value);
                    else delete next[group];
                    void save({ groupDepartments: next });
                  }}
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
            onChange={(value: string) =>
              void save({ defaultDepartmentId: value ? Number(value) : null })
            }
          />
          <Select
            label="Mailbox replies go out from, for web-form tickets"
            size="sm"
            options={mailboxes}
            value={options.defaultSourceId ? String(options.defaultSourceId) : ''}
            placeholder="The team's mailbox"
            clearable
            onChange={(value: string) =>
              void save({ defaultSourceId: value ? Number(value) : null })
            }
          />
        </div>
        {unmatched.length > 0 && (
          <Alert variant="info">
            No Odly account for {unmatched.map(([email]) => email).join(', ')} — their tickets come
            in unassigned. Invite them first if they should keep their tickets.
          </Alert>
        )}
        {notOurs.length > 0 && (
          <p className="text-muted-foreground">
            Sent to addresses that are not a mailbox in Odly:{' '}
            {notOurs.map(([address]) => address).join(', ')}. Those tickets use the team's mailbox
            for replies.
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setConfirmApply(true)} disabled={saving}>
          Import {(summary.created + summary.joined).toLocaleString()} tickets
        </Button>
      </div>

      <ConfirmDialog
        open={confirmApply}
        onOpenChange={setConfirmApply}
        variant="info"
        title="Import these tickets?"
        description={`${summary.created.toLocaleString()} new threads and ${summary.joined.toLocaleString()} updated ones. Nothing is sent to customers or agents. Importing the same account again later only adds what changed.`}
        confirmText="Import"
        onConfirm={() =>
          void onAct(() => zendeskImportService.apply(run.id), 'Could not start the import')
        }
      />
    </div>
  );
};
