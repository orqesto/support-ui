import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { formatDay } from '@/lib/utils';
import { KB_FILTER_STATUS_LABEL } from '@/features/kb/components/KbStatusFilter';
import { entryHref, kbRef, namedEntry } from '@/features/kb/lib/kbConsolidation';
import type { KbSplitCase } from '@/features/kb/services/kb.service';

/** How the case was split up, in the words the list uses; an unknown `via` is not guessed. */
const VIA_TEXT: Record<string, string> = {
  hide: 'the case was hidden',
  reject: 'the case was turned down',
  delete: 'the case was deleted',
  unmerge: 'the case was unmerged',
};

/** The sentence above the entries — exported for tests. */
export const kbSplitCaseText = (splitCase: KbSplitCase): string => {
  const how = splitCase.via ? VIA_TEXT[splitCase.via] : undefined;
  const when = splitCase.splitAt ? ` on ${formatDay(splitCase.splitAt)}` : '';
  const split = `It was split up${when}${how ? ` (${how})` : ''}`;
  const name = kbRef(splitCase.publicId, splitCase.caseId);
  return splitCase.entries.length
    ? `${name} was a merged case. ${split} and its entries are back on their own:`
    : `${name} was a merged case. ${split}. None of its entries are left that you can see.`;
};

/**
 * "#KB-1562 was a merged case. It was split up on 10 Nov 2026 …": a search by the number of a
 * case that is gone (hidden, turned down, deleted or unmerged) finds no row — this names the
 * entries it gave back, each opening in the drawer.
 */
export const KbSplitCaseHint = ({ splitCase }: { splitCase: KbSplitCase | null }) => {
  if (!splitCase) return null;
  return (
    <Alert variant="info">
      <p className="text-sm">{kbSplitCaseText(splitCase)}</p>
      {splitCase.entries.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {splitCase.entries.map((entry) => (
            <li key={entry.id}>
              <Link to={entryHref(entry.id)} className="font-medium underline hover:no-underline">
                {namedEntry(entry)}
              </Link>
              <span className="text-muted-foreground">{` — ${KB_FILTER_STATUS_LABEL[entry.status]}`}</span>
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
};
