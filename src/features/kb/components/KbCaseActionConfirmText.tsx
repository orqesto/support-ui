import type { KbCaseOriginal } from '@/features/kb/services/kbConsolidation.service';
import type { CaseActionKind } from '@/features/kb/components/runCaseAction';
import {
  MAX_NAMED_ENTRIES,
  namedEntry,
  unmergeConsequence,
} from '@/features/kb/lib/kbConsolidation';

/**
 * The confirm text before Hide / Reject / Delete / Unmerge on a case row (each one unmerges it).
 * With the case's originals read (`originals`), it names the entries that come back and which go
 * straight back live; without them (loading, failed, an older backend) the generic text.
 */
export const KbCaseActionConfirmText = ({
  action,
  originals,
}: {
  action: CaseActionKind | null;
  originals: KbCaseOriginal[] | null;
}) => {
  const lead =
    action === 'unmerge' ? 'This undoes the merge.' : 'This is a merged case, so this undoes the merge.';
  if (!originals) return <>{`${lead} ${unmergeConsequence(null)} and removes the merged entry.`}</>;
  if (!originals.length)
    return (
      <>{`${lead} No original entries are left to bring back. It removes the merged entry.`}</>
    );
  const named = originals.slice(0, MAX_NAMED_ENTRIES);
  const more = originals.length - named.length;
  return (
    <>
      <p>{`${lead} ${unmergeConsequence(originals.length)} and removes the merged entry:`}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5" aria-label="Entries that come back">
        {named.map((original) => (
          <li key={original.id}>
            {namedEntry(original)}
            {/* `live` when the backend says; an older one sends only `approved`. */}
            {(original.live ?? original.approved) && (
              <span className="text-muted-foreground"> — goes back live</span>
            )}
          </li>
        ))}
        {more > 0 && <li className="text-muted-foreground">{`and ${more} more`}</li>}
      </ul>
    </>
  );
};
