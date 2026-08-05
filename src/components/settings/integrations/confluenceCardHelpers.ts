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
export const syncMeta = (
  integ: Pick<
    BaseIntegration,
    'lastSyncStatus' | 'lastSyncedAt' | 'lastSyncedPageCount' | 'lastSyncError'
  >
): { text: string; cls: string } => {
  if (integ.lastSyncStatus === 'syncing') return { text: 'Syncing…', cls: 'text-blue-600' };
  if (integ.lastSyncStatus === 'failed') {
    const detail = integ.lastSyncError ? `: ${integ.lastSyncError.slice(0, 90)}` : '';
    return { text: `Sync failed${detail}`, cls: 'text-red-600' };
  }
  if (integ.lastSyncStatus === 'success') {
    const count = integ.lastSyncedPageCount ?? 0;
    const when = integ.lastSyncedAt ? ` · ${timeAgo(integ.lastSyncedAt)}` : '';
    return { text: `Synced ${count} page${count === 1 ? '' : 's'}${when}`, cls: 'text-green-600' };
  }
  return { text: 'Not synced yet', cls: 'text-muted-foreground' };
};
