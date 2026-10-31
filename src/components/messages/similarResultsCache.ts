import type { SimilarResult } from './AiTabPanel';

/*
  Session-scoped cache: survives remount (inbox → full page nav) but cleared on refresh.
  Exposed via accessor functions only — callers must not mutate the Map directly.

  Its own module, not AiTabPanel: the auth store (in the entry bundle) and the Threads page clear
  it, and importing it from the panel pulled the whole AI tab — and with it the thread view's
  code — into every page's first download.
*/
const cache = new Map<number, SimilarResult[]>();

export const similarResultsCache = {
  has: (id: number) => cache.has(id),
  get: (id: number) => cache.get(id),
  set: (id: number, data: SimilarResult[]) => {
    cache.set(id, data);
  },
  delete: (id: number) => {
    cache.delete(id);
  },
  clear: () => {
    cache.clear();
  },
};
