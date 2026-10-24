import type { ZendeskCounts, ZendeskRunStatus } from '@/services/zendeskImport.service';

/**
 * What a Zendesk import preview / report means in plain words. Pure, so the arithmetic is tested
 * apart from the screen.
 *
 * The BE preview matches EVERY ticket, spam included, and counts a spam ticket twice: under its
 * kind (`new`, `messageId`, `mapped`, `skipped_unchanged`, …) and again as `spam_<kind>`. With
 * "import spam" off, spam tickets that are NOT yet in Odly are skipped, so they come off their
 * kind here. A ticket an earlier import already brought in (`mapped`) is updated even when Zendesk
 * closed it as spam — the backend checks "already imported" before the spam skip — so `mapped` is
 * never reduced, and spam that is mapped, unchanged or deleted in Odly is not "skipped as spam".
 * Keys an older backend does not send count as 0.
 */
export type PreviewSummary = {
  total: number;
  /** New Odly threads. */
  created: number;
  /** Tickets that join a thread already in Odly (same email, follow-up, or re-import). */
  joined: number;
  /** Joined only if the admin opts in; otherwise they become new threads. */
  probable: number;
  conflicts: number;
  skippedSpam: number;
  unchanged: number;
  /** Already imported, but an agent deleted the Odly thread: skipped on purpose. */
  deletedInOdly: number;
};

const count = (counts: ZendeskCounts, key: string): number => counts[key] ?? 0;

export const summarizePreview = (
  counts: ZendeskCounts,
  options: { includeSpam: boolean; includeProbable: boolean },
  total: number
): PreviewSummary => {
  const minusSpam = (kind: string) =>
    count(counts, kind) - (options.includeSpam ? 0 : count(counts, `spam_${kind}`));
  const probable = minusSpam('probable');
  return {
    total,
    created: minusSpam('new') + (options.includeProbable ? 0 : probable),
    joined:
      minusSpam('messageId') +
      minusSpam('followup') +
      count(counts, 'mapped') +
      (options.includeProbable ? probable : 0),
    probable,
    conflicts: minusSpam('conflict'),
    skippedSpam: options.includeSpam
      ? 0
      : Math.max(
          0,
          count(counts, 'spamClosed') -
            count(counts, 'spam_mapped') -
            count(counts, 'spam_skipped_unchanged') -
            count(counts, 'spam_skipped_deleted')
        ),
    unchanged: count(counts, 'skipped_unchanged'),
    deletedInOdly: count(counts, 'skipped_deleted'),
  };
};

export const STATUS_LABEL: Record<ZendeskRunStatus, string> = {
  uploading: 'Uploading',
  previewing: 'Checking the export',
  previewed: 'Ready to import',
  applying: 'Importing',
  applied: 'Imported',
  attachments: 'Copying attachments',
  failed: 'Failed',
  cancelled: 'Stopped',
};

export const STATUS_BADGE: Record<ZendeskRunStatus, 'default' | 'success' | 'warning' | 'danger'> =
  {
    uploading: 'warning',
    previewing: 'warning',
    previewed: 'default',
    applying: 'warning',
    applied: 'success',
    attachments: 'warning',
    failed: 'danger',
    cancelled: 'default',
  };

/** A worker step is running: poll, and lock the controls. */
export const isBusy = (status: ZendeskRunStatus): boolean =>
  status === 'previewing' || status === 'applying' || status === 'attachments';

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** CSV is Zendesk's other export and has no conversations — say so before uploading anything. */
export const exportFileProblem = (file: { name: string; size: number }): string | null => {
  if (/\.csv$/i.test(file.name)) {
    return 'This is a CSV export, which has no conversations. In Zendesk, export JSON instead.';
  }
  if (!/\.(zip|json|ndjson|jsonl)$/i.test(file.name)) {
    return 'Choose the Zendesk JSON export (a .zip or .json file).';
  }
  if (file.size === 0) return 'The file is empty.';
  return null;
};

/**
 * Where imported Zendesk tickets land (owner decision 5, 2026-10-23): each becomes a THREAD — in the
 * threads list, not under Tickets.
 */
export const ZENDESK_AS_THREADS =
  'Each Zendesk ticket is imported as a thread: you find them in the threads list, not under Tickets.';

/** What a stopped attachments copy says (BE `report.attachments.stoppedReason`). */
export const attachmentsStoppedText = (
  reason: 'storage_full' | 'stopped' | 'failed' | undefined,
  message?: string
): string | undefined => {
  const again = 'Copy attachments again to continue: files already copied are skipped.';
  switch (reason) {
    case 'storage_full':
      return `Copying attachments stopped: the workspace's storage is full. Free some room or upgrade your plan, then ${again.charAt(0).toLowerCase()}${again.slice(1)}`;
    case 'stopped':
      return `Copying attachments stopped before it finished${message ? ` (${message})` : ''}. ${again}`;
    case 'failed':
      return `Copying attachments failed before it finished${message ? ` (${message})` : ''}. ${again}`;
    default:
      return undefined;
  }
};

/**
 * "Copy attachments" can start (again) after an Apply finished on the run — also once that copy
 * failed or was stopped (a full quota, a deploy, the time budget). A report is written only by
 * Apply and Attachments, so a failed or cancelled run WITH a report had an Apply finish.
 */
export const canCopyAttachments = (run: { status: string; report: unknown }): boolean =>
  run.status === 'applied' ||
  ((run.status === 'failed' || run.status === 'cancelled') && run.report !== null);

/**
 * A step refused because another import of the workspace is writing (BE: one writer per
 * workspace, 409 with no code — matched by its sentence). undefined for anything else.
 */
export const anotherRunBusyText = (message: string | undefined): string | undefined =>
  message && /another zendesk import of this workspace is running/i.test(message)
    ? 'Another Zendesk import of this workspace is writing right now. Wait for it to finish, or stop it, then start this step again.'
    : undefined;
