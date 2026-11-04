import { useEffect } from 'react';

const COUNT_PREFIX = /^\(\d+\) /;

/**
 * Shows the bell's unread total in the browser tab: `(3) Odly`, plain `Odly` at 0. Only the
 * count prefix is touched — a page that sets its own title keeps it, and the prefix is added in
 * front of it. The title goes back to `base` when the bell unmounts.
 */
export const useTabTitleCount = (unread: number, base = 'Odly'): void => {
  useEffect(() => {
    const current = document.title.replace(COUNT_PREFIX, '') || base;
    document.title = unread > 0 ? `(${unread}) ${current}` : current;
  }, [unread, base]);

  useEffect(
    () => () => {
      document.title = base;
    },
    [base]
  );
};
