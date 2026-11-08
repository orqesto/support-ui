import { useEffect, useRef, useState } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import type { MessagesDisplayMode } from '@/types';
import { LIST_ONLY_FILTER_PARAMS } from '../components/messagesPage/messagesPageConstants';

/** List / board / contacts, from the URL and the saved choice, kept in the URL. Moved unchanged from MessagesPage. */
export const useMessagesDisplayMode = (
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams
) => {
  const [displayMode, setDisplayMode] = useState<MessagesDisplayMode>(() => {
    const mode = searchParams.get('mode');
    if (mode === 'contacts') return 'contacts';
    if (mode === 'kanban') return 'kanban';
    // Arriving via a filter-bearing link (e.g. dashboard cards: "Messages
    // by Status", "Closed", SLA Breached / At Risk) without an explicit
    // ?mode= → force list view. Kanban groups by status itself, so any of
    // these URLs in kanban look like a no-op. Bookmarks that explicitly
    // request ?mode=kanban still win above.
    if (LIST_ONLY_FILTER_PARAMS.some((key) => searchParams.get(key))) return 'threads';
    const stored = localStorage.getItem('messages_view_mode');
    if (stored === 'contacts' || stored === 'kanban') return stored;
    return 'threads';
  });
  const displayModeSyncedRef = useRef(false);
  useEffect(() => {
    if (!displayModeSyncedRef.current) {
      displayModeSyncedRef.current = true;
      return;
    }
    const mode = searchParams.get('mode');
    if (mode === 'contacts') setDisplayMode('contacts');
    else if (mode === 'kanban') setDisplayMode('kanban');
    // No explicit ?mode= but a list-only filter arrived (e.g. Notification Center
    // "Spam"/"Suspicious" → ?queue=spam while already on Kanban): switch to the
    // list view so the queue is actually shown instead of a silent no-op.
    else if (LIST_ONLY_FILTER_PARAMS.some((key) => searchParams.get(key)))
      setDisplayMode('threads');
  }, [searchParams]);
  useEffect(() => {
    localStorage.setItem('messages_view_mode', displayMode);
  }, [displayMode]);
  // Keep URL in sync with displayMode so the address bar is always bookmarkable
  useEffect(() => {
    setSearchParams(
      (params) => {
        if (displayMode === 'kanban') params.set('mode', 'kanban');
        else if (displayMode === 'contacts') params.set('mode', 'contacts');
        else params.delete('mode');
        return params;
      },
      { replace: true }
    );
  }, [displayMode, setSearchParams]);
  return [displayMode, setDisplayMode] as const;
};
