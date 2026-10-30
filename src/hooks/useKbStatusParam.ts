import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { KB_FILTER_STATUSES, type KbFilterStatus } from '@/components/kb/KbStatusFilter';

/**
 * The Knowledge Base status filter, kept in `?status=` as its single source of truth, so a link,
 * refresh, back or share lands on it. Changing it keeps the other params and the tab hash.
 * `view`: the page view the change is made on, written as `?view=` so a status that alone would
 * open another view (`needs_decision` opens Questions) keeps the page where it is.
 */
export const useKbStatusParam = (
  view?: string
): [KbFilterStatus, (next: KbFilterStatus) => void] => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('status');
  const status: KbFilterStatus = KB_FILTER_STATUSES.includes(requested as KbFilterStatus)
    ? (requested as KbFilterStatus)
    : 'all';
  const setStatus = useCallback(
    (next: KbFilterStatus) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'all') params.delete('status');
      else params.set('status', next);
      if (view) params.set('view', view);
      // setSearchParams strips location.hash — go through navigate to keep the tab hash.
      navigate({ search: params.toString(), hash: location.hash }, { replace: true });
    },
    [navigate, searchParams, location.hash, view]
  );
  return [status, setStatus];
};
