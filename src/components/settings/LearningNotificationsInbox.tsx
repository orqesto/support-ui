import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Layers,
  RefreshCw,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';
import {
  learningService,
  type LearningAutoActionType,
  type LearningNotification,
} from '@/services/learning.service';

const DOMAIN_LABELS: Record<string, string> = {
  routing: 'Routing',
  spam: 'Spam',
  detection: 'Detection',
  contradiction: 'Contradiction',
  category: 'Category',
  suggested_reply: 'Suggested Reply',
  auto_reply: 'Auto-Reply',
  auto_reply_block: 'Auto-Reply Block',
  kb_extraction: 'KB Extraction',
  kb_scope: 'KB Scope',
  kb_quality: 'KB Quality',
  sentiment: 'Sentiment',
  lead: 'Lead',
  multi_topic: 'Multi-Topic',
  sla: 'SLA',
  resolution_quality: 'Resolution Quality',
};

const ACTION_META: Record<LearningAutoActionType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}> = {
  promote: {
    label: 'Promoted',
    icon: CheckCircle2,
    className: 'text-emerald-600 dark:text-emerald-400',
  },
  consolidate: {
    label: 'Consolidated',
    icon: Layers,
    className: 'text-blue-600 dark:text-blue-400',
  },
  disable_provisional: {
    label: 'Disabled provisional',
    icon: XCircle,
    className: 'text-amber-600 dark:text-amber-400',
  },
  delete_provisional: {
    label: 'Deleted provisional',
    icon: Trash2,
    className: 'text-red-600 dark:text-red-400',
  },
};

const PAGE_SIZE = 20;

const formatNumber = (value: unknown, fractionDigits = 0): string | null => {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return value.toFixed(fractionDigits);
};

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

const daysUntil = (iso: string): number => {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
};

// Engine writes a heterogeneous payload per (domain, actionType). Surface the
// fields most likely to help an admin decide whether to undo — without crashing
// on unknown shapes.
const evidenceHighlights = (evidence: Record<string, unknown>): string[] => {
  const out: string[] = [];
  const cf = formatNumber(
    typeof evidence.counterfactualRatio === 'number' ? evidence.counterfactualRatio * 100 : null,
    0
  );
  if (cf !== null) out.push(`Counterfactual ${cf}%`);
  const corroborations = formatNumber(evidence.corroborations);
  if (corroborations !== null) out.push(`Corroborations ${corroborations}`);
  const contradictions = formatNumber(evidence.contradictions);
  if (contradictions !== null) out.push(`Contradictions ${contradictions}`);
  const support = formatNumber(evidence.support);
  if (support !== null) out.push(`Support ${support}`);
  const cluster = formatNumber(evidence.clusterSize);
  if (cluster !== null) out.push(`Cluster ${cluster}`);
  if (typeof evidence.reason === 'string' && evidence.reason.length > 0 && out.length === 0) {
    out.push(evidence.reason);
  }
  return out;
};

export const LearningNotificationsInbox = () => {
  const { isOrgAdmin } = usePermissions();
  const [rows, setRows] = useState<LearningNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const selectedDeptKey = useDepartmentContextKey();
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await learningService.listNotifications();
      setRows(next);
      setPage(0);
    } catch (err) {
      logger.error('Failed to load learning notifications:', err);
      setError('Failed to load notifications. Please try again.');
    } finally {
      setLoading(false);
    }
    // selectedDeptKey and selectedOrganizationId are refresh-signals; re-fetch when
    // the dept context or the active organization changes (global admins switching
    // orgs must not keep seeing the previous org's notifications).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeptKey, selectedOrganizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUndo = async (id: number) => {
    setUndoingId(id);
    setError(null);
    try {
      await learningService.undoNotification(id);
      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      logger.error('Failed to undo learning notification:', err);
      setError(
        'Undo failed. The action may already have been undone, or the 30-day window may have expired.'
      );
    } finally {
      setUndoingId(null);
    }
  };

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (rowA, rowB) => new Date(rowB.createdAt).getTime() - new Date(rowA.createdAt).getTime()
      ),
    [rows]
  );
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Undo route is admin-only; non-admins would see an empty undo action.
  if (!isOrgAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex gap-2 items-center">
            <Bell className="w-5 h-5" />
            Engine Auto-Actions
            {rows.length > 0 && (
              <span className="px-2 py-0.5 ml-1 text-xs font-medium rounded-full bg-primary/10 text-primary">
                {rows.length}
              </span>
            )}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          When the engine runs in <strong>balanced</strong> or <strong>aggressive</strong> trust
          mode, high-confidence findings are applied automatically. Each auto-action is reversible
          for 30 days. Undoing also records a strong negative trust signal so the engine becomes
          more conservative on future runs.
        </p>

        {error && (
          <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md text-sm bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loading && rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading auto-actions…</p>
        ) : sorted.length === 0 ? (
          <div className="py-8 text-center">
            <Bell className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No active auto-actions.</p>
            <p className="text-xs text-muted-foreground mt-1">
              When the engine auto-applies a finding, it will appear here with an undo button.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {pageRows.map((row) => {
                const meta = ACTION_META[row.actionType];
                const Icon = meta?.icon ?? Bell;
                const highlights = evidenceHighlights(row.evidence);
                const isUndoing = undoingId === row.id;
                const remainingDays = daysUntil(row.undoAvailableUntil);
                return (
                  <div
                    key={row.id}
                    className="flex justify-between gap-3 items-start p-3 rounded-lg border border-border bg-background"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-2 items-center mb-1">
                        <span className={`inline-flex gap-1 items-center text-xs font-semibold ${meta?.className ?? 'text-foreground'}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {meta?.label ?? row.actionType}
                        </span>
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                          {DOMAIN_LABELS[row.domain] ?? row.domain}
                        </span>
                      </div>
                      <p className="text-sm font-medium break-words">{row.summary}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        {highlights.map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                        <span>{formatDate(row.createdAt)}</span>
                        <span>
                          Undo window: {remainingDays} day{remainingDays === 1 ? '' : 's'} left
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleUndo(row.id)}
                        disabled={isUndoing || undoingId !== null}
                        title="Undo this auto-action and record a negative trust signal"
                      >
                        {isUndoing ? (
                          <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Undo2 className="w-4 h-4 mr-1" />
                        )}
                        Undo
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {pageCount > 1 && (
              <div className="flex justify-between items-center mt-4">
                <p className="text-xs text-muted-foreground">
                  Showing {safePage * PAGE_SIZE + 1}–
                  {Math.min(sorted.length, safePage * PAGE_SIZE + PAGE_SIZE)} of {sorted.length}
                </p>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                    disabled={safePage === 0}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
                    disabled={safePage >= pageCount - 1}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
