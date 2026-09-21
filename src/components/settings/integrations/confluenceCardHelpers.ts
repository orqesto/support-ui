import type { BaseIntegration } from '@/services/integrations.service';

// Parse a raw "SUP, DOCS ENG" input into a clean string[] of space keys. The saved
// config MUST carry spaceKeys as an array (the backend sync expects string[]).
export const parseSpaceKeys = (raw: string): string[] =>
  raw
    .split(/[\s,]+/)
    .map((key) => key.trim())
    .filter(Boolean);

export const timeAgo = (iso: string): string => {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

// Last-sync summary line shown under each saved space.
//
// `selectedCount` (folders + pages picked): a sync with nothing selected fetches nothing, and
// "Synced 0 pages" in green read as "working, just empty" — say what is actually missing.
export const syncMeta = (
  integ: Pick<
    BaseIntegration,
    'lastSyncStatus' | 'lastSyncedAt' | 'lastSyncedPageCount' | 'lastSyncError'
  >,
  selectedCount?: number
): { text: string; cls: string } => {
  if (integ.lastSyncStatus === 'syncing') return { text: 'Syncing…', cls: 'text-muted-foreground' };
  if (integ.lastSyncStatus === 'failed') {
    const detail = integ.lastSyncError ? `: ${integ.lastSyncError.slice(0, 90)}` : '';
    return { text: `Sync failed${detail}`, cls: 'text-destructive' };
  }
  if (integ.lastSyncStatus === 'success') {
    const count = integ.lastSyncedPageCount ?? 0;
    if (count === 0 && selectedCount === 0) {
      return {
        text: 'Connected — nothing selected yet. Choose folders or pages to sync.',
        cls: 'text-warning',
      };
    }
    const when = integ.lastSyncedAt ? ` · ${timeAgo(integ.lastSyncedAt)}` : '';
    return { text: `Synced ${count} page${count === 1 ? '' : 's'}${when}`, cls: 'text-success' };
  }
  return { text: 'Not synced yet', cls: 'text-muted-foreground' };
};

/**
 * The status dot. It used to be green whenever the source was ENABLED, so a source whose token
 * Confluence rejected still showed green next to a small "Sync failed" line (2026-09-17). It now
 * reports health: green only after a successful sync.
 */
export const syncDot = (
  integ: Pick<BaseIntegration, 'enabled' | 'lastSyncStatus'>
): { cls: string; label: string } => {
  if (!integ.enabled) return { cls: 'bg-faint-foreground', label: 'Paused' };
  if (integ.lastSyncStatus === 'failed') return { cls: 'bg-destructive', label: 'Sync failed' };
  if (integ.lastSyncStatus === 'syncing') return { cls: 'bg-muted-foreground', label: 'Syncing' };
  if (integ.lastSyncStatus === 'success') return { cls: 'bg-success', label: 'Synced' };
  return { cls: 'bg-warning', label: 'Not synced yet' };
};
