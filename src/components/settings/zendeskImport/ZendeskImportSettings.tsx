import { FileUp, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ZendeskImportPreview } from './ZendeskImportPreview';
import { ZendeskImportReport } from './ZendeskImportReport';
import {
  exportFileProblem,
  formatBytes,
  isBusy,
  STATUS_BADGE,
  STATUS_LABEL,
} from './zendeskImportSummary';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Progress } from '@/components/ui/Progress';
import { Spinner } from '@/components/ui/Spinner';
import { apiErrorMessage, apiErrorStatus, isRouteAbsent } from '@/lib/apiError';
import { toast } from '@/lib/toast';
import {
  isAbortError,
  uploadZendeskExport,
  zendeskImportService,
  type ZendeskRun,
} from '@/services/zendeskImport.service';

/** How often a running step is re-read. */
const POLL_MS = 3000;

/**
 * Settings → Integrations → Import: move a workspace from Zendesk by uploading its JSON export.
 * Upload → the server checks the export (Preview, writes nothing) → the admin decides spam,
 * probable matches and which team each Zendesk group lands in → Import → optional copy of
 * the attachments. Every step runs on the server; this screen only starts them and polls.
 */
export const ZendeskImportSettings = () => {
  const [run, setRun] = useState<ZendeskRun | null>(null);
  /** The newest earlier run with a report, shown below when the current run is a newer one. */
  const [previous, setPrevious] = useState<ZendeskRun | null>(null);
  /** Polling stopped because the run is gone or the session ended — said once, not retried. */
  const [pollProblem, setPollProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [upload, setUpload] = useState<{ sent: number; total: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    try {
      // Newest first. The newest run is the one being worked on, even an abandoned upload — it
      // must stay reachable so it can be deleted; the last import's report stays visible below.
      const runs = await zendeskImportService.list();
      const current = runs[0] ?? null;
      setRun(current);
      setPrevious(
        current?.report ? null : (runs.slice(1).find((candidate) => candidate.report) ?? null)
      );
      setPollProblem(null);
    } catch (error) {
      // A backend without the import yet (the FE can deploy first): say so, do not error-toast.
      if (isRouteAbsent(error)) setUnavailable(true);
      else toast.error(apiErrorMessage(error, 'Could not load the Zendesk import'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runId = run?.id;
  const busy = run ? isBusy(run.status) : false;
  useEffect(() => {
    if (!runId || !busy || pollProblem) return undefined;
    const timer = window.setInterval(() => {
      zendeskImportService
        .get(runId)
        .then(setRun)
        .catch((error: unknown) => {
          // A blip is retried on the next tick; a run that is gone or a session that ended is not.
          const status = apiErrorStatus(error);
          if (status === 404) {
            window.clearInterval(timer);
            setPollProblem(
              'This import is no longer there — it may have been deleted in another window. Reload the page to see the current state.'
            );
          } else if (status === 401) {
            window.clearInterval(timer);
            setPollProblem('You were signed out. Sign in again to follow the import.');
          }
        });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [runId, busy, pollProblem]);

  useEffect(() => () => abort.current?.abort(), []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = exportFileProblem(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    try {
      const created = await zendeskImportService.create(file);
      // The upload first, so the run is never seen as 'uploading' with nothing uploading.
      setUpload({ sent: 0, total: file.size });
      setRun(created);
      await uploadZendeskExport(
        created.id,
        file,
        (sent) => setUpload({ sent, total: file.size }),
        controller.signal
      );
      setRun(await zendeskImportService.complete(created.id));
    } catch (error) {
      // Stopping is the admin's own choice, not a failure.
      if (isAbortError(error, controller.signal)) toast.info('Upload stopped');
      else toast.error(apiErrorMessage(error, 'The upload failed'));
      await load();
    } finally {
      setUpload(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const act = async (action: () => Promise<unknown>, failure: string) => {
    try {
      await action();
      if (runId) setRun(await zendeskImportService.get(runId));
    } catch (error) {
      // 409 = the step cannot start yet (the previous one is still stopping, or the run moved
      // on). The run stays as it is and the admin tries again — a notice, not a failure.
      if (apiErrorStatus(error) === 409) toast.warning(apiErrorMessage(error, failure));
      else toast.error(apiErrorMessage(error, failure));
    }
  };

  if (loading) return <Spinner />;
  if (unavailable) {
    return <Alert variant="info">Zendesk import is not available on this server yet.</Alert>;
  }

  // 'uploading' with no upload running in this tab = an upload that was stopped or lost: it can
  // be deleted, or a new upload started.
  const abandoned = run?.status === 'uploading' && !upload;
  const canStartNew = !run || ['applied', 'failed', 'cancelled', 'uploading'].includes(run.status);
  const progress = run?.progress;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Import from Zendesk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Bring your Zendesk tickets into Odly: the conversation, status, assignee, priority, tags
            and internal notes. Upload the <strong>JSON</strong> export (Zendesk Admin Center →
            Account → Tools → Reports → Export; a CSV export has no conversations). You see what
            will happen before anything is written, and importing the same account again only adds
            what is new. No emails or notifications are sent.
          </p>
          {canStartNew && !upload && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".zip,.json,.ndjson,.jsonl"
                className="hidden"
                aria-label="Zendesk export file"
                onChange={(event) => void onFile(event.target.files?.[0])}
              />
              <Button onClick={() => fileInput.current?.click()}>
                <FileUp className="mr-2 w-4 h-4" />
                {run ? 'Upload a newer export' : 'Upload Zendesk export'}
              </Button>
            </>
          )}
          {upload && (
            <div className="space-y-2">
              <p>
                Uploading {formatBytes(upload.sent)} of {formatBytes(upload.total)}…
              </p>
              <Progress value={upload.sent} max={upload.total} aria-label="Upload progress" />
              <Button variant="outline" size="sm" onClick={() => abort.current?.abort()}>
                <X className="mr-1 w-4 h-4" />
                Stop upload
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {run && (run.status !== 'uploading' || abandoned) && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-2 justify-between items-center">
              <CardTitle>
                {run.fileName ?? 'Zendesk export'}
                {run.source ? ` · ${run.source}.zendesk.com` : ''}
              </CardTitle>
              <div className="flex gap-2 items-center">
                <Badge variant={STATUS_BADGE[run.status]}>
                  {abandoned ? 'Upload stopped' : STATUS_LABEL[run.status]}
                </Badge>
                {busy ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void act(() => zendeskImportService.cancel(run.id), 'Could not stop')
                    }
                  >
                    Stop
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete this import"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {busy && progress && (
              <div className="space-y-2">
                <p>
                  {STATUS_LABEL[run.status]} — {progress.done.toLocaleString()}
                  {progress.total ? ` of ${progress.total.toLocaleString()}` : ''}{' '}
                  {progress.phase === 'attachments' ? 'files' : 'tickets'}
                </p>
                {progress.total ? (
                  <Progress
                    value={progress.done}
                    max={progress.total}
                    aria-label={`${STATUS_LABEL[run.status]} progress`}
                  />
                ) : (
                  <Spinner />
                )}
              </div>
            )}
            {busy && !progress && <Spinner />}
            {pollProblem && <Alert variant="warning">{pollProblem}</Alert>}
            {abandoned && (
              <Alert variant="warning">
                This upload stopped before it finished
                {run.partsUploaded > 0 ? ` (${run.partsUploaded.toLocaleString()} parts sent)` : ''}
                . Delete it, or upload the export again.
              </Alert>
            )}
            {run.status === 'failed' && run.error && <Alert variant="danger">{run.error}</Alert>}
            {run.preview &&
              (run.status === 'previewed' ||
                run.status === 'failed' ||
                run.status === 'cancelled') && (
                <ZendeskImportPreview run={run} onRunChange={setRun} onAct={act} />
              )}
            {run.report && !busy && run.status !== 'previewed' && (
              <ZendeskImportReport run={run} onAct={act} />
            )}
          </CardContent>
        </Card>
      )}

      {previous?.report && (
        <Card>
          <CardHeader>
            <CardTitle>
              Last import: {previous.fileName ?? 'Zendesk export'}
              {previous.source ? ` · ${previous.source}.zendesk.com` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ZendeskImportReport run={previous} onAct={act} readOnly />
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        variant="warning"
        title="Delete this import?"
        description="The uploaded file and this import's report are deleted. Threads already imported stay in Odly, and a later upload of the same Zendesk account still updates them instead of adding copies."
        confirmText="Delete"
        onConfirm={() => {
          if (!run) return;
          zendeskImportService
            .remove(run.id)
            .then(() => {
              setRun(null);
              return load();
            })
            .catch((error: unknown) =>
              toast.error(apiErrorMessage(error, 'Could not delete the import'))
            );
        }}
      />
    </div>
  );
};
