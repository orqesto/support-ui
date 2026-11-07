import { Download, Paperclip, RotateCcw } from 'lucide-react';
import { downloadConflicts } from './ZendeskImportPreview';
import { attachmentsStoppedText, canCopyAttachments } from './zendeskImportSummary';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { apiErrorMessage } from '@/lib/apiError';
import { toast } from '@/lib/toast';
import { zendeskImportService, type ZendeskRun } from '@/services/zendeskImport.service';

type Props = {
  run: ZendeskRun;
  onAct: (action: () => Promise<unknown>, failure: string) => Promise<void>;
  /** An earlier import shown for reference: its report only, no follow-up steps. */
  readOnly?: boolean;
};

const num = (value: number | undefined): string => (value ?? 0).toLocaleString();

/** What the import did, and the follow-up steps (attachments, run again). */
export const ZendeskImportReport = ({ run, onAct, readOnly = false }: Props) => {
  const report = run.report;
  if (!report) return null;
  const counts = report.counts;
  const joined =
    (counts.messageId ?? 0) +
    (counts.followup ?? 0) +
    (counts.mapped ?? 0) +
    (counts.probable ?? 0);
  const files = report.attachments?.counts;

  return (
    <div className="space-y-4">
      <section className="space-y-1">
        <h3 className="font-semibold">Imported</h3>
        <ul className="space-y-1">
          <li>
            {num(counts.created)} new threads, {num(joined)} threads updated
          </li>
          <li>
            {num(counts.eventsAdded)} messages added, {num(counts.eventsMatched)} already in Odly
            (not copied again), {num(counts.notesAdded)} internal notes
          </li>
          {(counts.skipped_unchanged ?? 0) > 0 && (
            <li>{num(counts.skipped_unchanged)} unchanged since the last import</li>
          )}
          {(counts.skipped_deleted ?? 0) > 0 && (
            <li>{num(counts.skipped_deleted)} deleted in Odly — skipped</li>
          )}
          {(counts.skipped_spam ?? 0) > 0 && (
            <li>{num(counts.skipped_spam)} closed as spam, skipped</li>
          )}
          {(counts.odlyNewerKept ?? 0) > 0 && (
            <li>
              {num(counts.odlyNewerKept)} threads keep their Odly status and assignee — someone
              changed them in Odly after Zendesk did
            </li>
          )}
          {(counts.customerMailKept ?? 0) > 0 && (
            <li>
              {num(counts.customerMailKept)} threads keep their Odly status — the customer wrote
              after the ticket’s last Zendesk message, so Zendesk’s status is out of date
            </li>
          )}
        </ul>
      </section>

      {(counts.conflict ?? 0) > 0 && (
        <Alert variant="warning">
          <span>
            {num(counts.conflict)} tickets matched more than one Odly thread and were not
            imported.{' '}
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
      {(counts.failed ?? 0) > 0 && (
        <Alert variant="danger">
          {num(counts.failed)} tickets could not be imported (first: Zendesk #
          {report.failures
            .map((failure) => failure.ticketId)
            .slice(0, 10)
            .join(', #')}
          ). Run the import again to retry them — what is already in is not copied twice.
        </Alert>
      )}
      {Object.keys(report.unmatchedAssignees).length > 0 && (
        <Alert variant="info">
          Unassigned because they have no Odly account:{' '}
          {Object.keys(report.unmatchedAssignees).join(', ')}.
        </Alert>
      )}

      {files && (
        <section className="space-y-1">
          <h3 className="font-semibold">Attachments</h3>
          <p>
            {num(files.stored)} copied
            {(files.alreadyStored ?? 0) > 0 ? `, ${num(files.alreadyStored)} already there` : ''}
            {(files.tooLarge ?? 0) > 0 ? `, ${num(files.tooLarge)} too large` : ''}
            {(files.failed ?? 0) > 0 ? `, ${num(files.failed)} could not be downloaded` : ''}
          </p>
          {attachmentsStoppedText(
            report.attachments?.stoppedReason,
            report.attachments?.stoppedMessage
          ) && (
            <div data-testid="attachments-stopped">
              <Alert variant="warning">
                {attachmentsStoppedText(
                  report.attachments?.stoppedReason,
                  report.attachments?.stoppedMessage
                )}
              </Alert>
            </div>
          )}
        </section>
      )}

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {canCopyAttachments(run) && (
            <Button
              variant="outline"
              onClick={() =>
                void onAct(
                  () => zendeskImportService.attachments(run.id),
                  'Could not start copying attachments'
                )
              }
            >
              <Paperclip className="mr-1 w-4 h-4" />
              {files ? 'Copy attachments again' : 'Copy attachments from Zendesk'}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() =>
              void onAct(() => zendeskImportService.preview(run.id), 'Could not start the check')
            }
          >
            <RotateCcw className="mr-1 w-4 h-4" />
            Check again
          </Button>
        </div>
      )}
    </div>
  );
};
