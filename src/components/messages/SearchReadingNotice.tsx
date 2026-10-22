import { Alert } from '@/components/ui/Alert';
import type { SearchReading } from '@/services/message.service';

/**
 * What the list should say about HOW the search was read, when it matters to the answer.
 *
 * Both cases are a backend bound that bit, and a bound must report that it bit: without these
 * lines a short or empty list reads as "that is everything", which it may not be.
 * - asPhrase: more words than the backend matches one by one, so it matched them as one phrase.
 * - cutShort: a term no word starts with was searched INSIDE words and that search hit its time
 *   or size limit. On a timeout NONE of its matches are in the list, so the wording does not say
 *   "some".
 */
export const SearchReadingNotice = ({ reading }: { reading: SearchReading | null }) => {
  if (!reading) return null;
  return (
    <>
      {reading.asPhrase && (
        <Alert variant="info">
          Searched as one exact phrase — more than 8 words. Use fewer words to match them in any
          order.
        </Alert>
      )}
      {reading.cutShort.length > 0 && (
        <Alert variant="warning">
          Results may be incomplete: searching inside words for{' '}
          {reading.cutShort.map((term) => `“${term}”`).join(', ')} was stopped early (too slow, or
          too many matches), so threads matching it may be missing. Use a whole word, or the start
          of one.
        </Alert>
      )}
    </>
  );
};
