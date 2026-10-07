import type { KbEntriesMove } from '@/services/platform.service';

/** "1 knowledge-base entry" / "3 knowledge-base entries". */
export const kbEntriesCount = (count: number): string =>
  `${count} knowledge-base entr${count === 1 ? 'y' : 'ies'}`;

/**
 * The success toast's tail for a department deactivation: what happened to its KB entries.
 * Empty when none moved, and when the backend did not say (an older deployment).
 */
export const kbMovedSuffix = (kb: KbEntriesMove | null | undefined): string =>
  kb && kb.count > 0
    ? ` · ${kbEntriesCount(kb.count)} moved to ${kb.toDepartmentName ?? 'another department'}`
    : '';
