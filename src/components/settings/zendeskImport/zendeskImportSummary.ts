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
