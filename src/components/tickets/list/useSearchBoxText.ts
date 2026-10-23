import { useEffect, useState } from 'react';

/**
 * The text in a list's search box: what is being typed (searched on Enter), and — whenever the
 * APPLIED search changes from elsewhere — that search. The applied one arrives after the first
 * render when the page opens on a link (`/tickets?search=…`: the URL is read into the store on
 * mount) or a saved view brings its own; without this the list was filtered under an empty box
 * (staging, 2026-10-23). Typing never changes the applied search until Enter, so it is never
 * overwritten.
 */
export const useSearchBoxText = (applied: string | undefined) => {
  const [text, setText] = useState(applied ?? '');
  useEffect(() => {
    setText(applied ?? '');
  }, [applied]);
  return [text, setText] as const;
};
