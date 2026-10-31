import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { KbEntryAlert } from '@/hooks/useKbEntryParam';

export const ENTRY_DECIDED_TEXT = 'Already decided: that suggestion is no longer open.';
const NOTICE_MS = 6000;

/**
 * "Decide in Knowledge Base" for a quality suggestion links `?entry=<entry id>`: the page opens
 * that entry's drawer by handing the id to the `?id=` deep link. An entry that cannot be read
 * (gone, or not this viewer's) is a one-line "Already decided" notice, never the error dialog.
 * Any other unreadable `?id=` keeps its error dialog.
 */
export const useKbDecideLink = (onAlert: (alert: KbEntryAlert) => void) => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);
  const linked = useRef(false);

  const entry = searchParams.get('entry');
  useEffect(() => {
    if (!entry) return;
    linked.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('entry');
    next.set('id', entry);
    navigate({ search: next.toString(), hash: location.hash }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const onNotFound = useCallback(
    (alert: KbEntryAlert) => {
      if (linked.current) {
        linked.current = false;
        setNotice(ENTRY_DECIDED_TEXT);
      } else onAlert(alert);
    },
    [onAlert]
  );
  return { notice, onNotFound };
};
