import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/lib/logger';
import { savedViewService } from '@/services/savedView.service';
import {
  loadSavedViews,
  persistSavedViews,
  type SavedView,
  type SavedViewSource,
} from './savedViews';
import type { FilterState } from '@/stores/messagesStore';
import { getApiErrorMessage } from '@/lib/errorMessages';

/**
 * The user's own saved views, and the two ways of writing them.
 *
 * Two, because the frontend ships from `main` and is live the moment it merges while the
 * API goes through staging: for that window there is no endpoint, and a view has to keep
 * working out of localStorage rather than disappear. Which mode is in play is decided
 * once, by whether the list loaded, and every write follows it — a session that started
 * local stays local rather than writing half its views to each.
 */
export const useSavedViews = (): {
  views: SavedView[];
  source: SavedViewSource;
  loading: boolean;
  /** Set when a write failed, for the bar to show. Cleared by the next successful one. */
  error: string;
  saveView: (name: string, filters: Partial<FilterState>) => Promise<void>;
  removeView: (view: SavedView) => Promise<void>;
} => {
  const [views, setViews] = useState<SavedView[]>([]);
  const [source, setSource] = useState<SavedViewSource>('remote');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    loadSavedViews()
      .then((loaded) => {
        if (!live) return;
        setViews(loaded.views);
        setSource(loaded.source);
      })
      .catch((err: unknown) => {
        // loadSavedViews already falls back rather than rejecting; this is the
        // belt-and-braces path, and an empty pill row is the right answer for it.
        logger.error('Saved views: could not load', err);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const saveView = useCallback(
    async (name: string, filters: Partial<FilterState>) => {
      // Saving over a name replaces that view — the name is how it is referred to, so two
      // pills reading the same thing and doing different things is not a state to allow.
      const withoutName = views.filter((view) => view.name !== name);
      if (source === 'local') {
        const next = [...withoutName, { name, filters }];
        setViews(next);
        persistSavedViews(next);
        return;
      }
      try {
        const saved = await savedViewService.save(name, filters);
        setViews([...withoutName, { id: saved.id, name: saved.name, filters: saved.filters }]);
        setError('');
      } catch (err) {
        logger.error('Saved views: could not save', err);
        setError(
          getApiErrorMessage(err) ??
            `“${name}” could not be saved. Your other views are unaffected.`
        );
      }
    },
    [source, views]
  );

  const removeView = useCallback(
    async (view: SavedView) => {
      const next = views.filter((row) => row.name !== view.name);
      if (source === 'local' || view.id === undefined) {
        setViews(next);
        persistSavedViews(next);
        return;
      }
      try {
        await savedViewService.remove(view.id);
        setViews(next);
        setError('');
      } catch (err) {
        // The row is still there, so the pill has to be too — removing it from the list
        // would show a delete that did not happen and come back on the next load.
        logger.error('Saved views: could not delete', err);
        setError(getApiErrorMessage(err) ?? `“${view.name}” could not be deleted.`);
      }
    },
    [source, views]
  );

  return { views, source, loading, error, saveView, removeView };
};
