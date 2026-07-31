import { useEffect, useState } from 'react';
import { ArrowRight, Inbox } from 'lucide-react';
import { departmentService, type Department } from '@/services/department.service';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { logger } from '@/lib/logger';

const CHANNEL_TYPES = new Set(['gmail', 'email', 'slack', 'telegram']);

/**
 * Step 5 — read-only routing confirmation: active departments and connected
 * channels. Unmatched messages go to the triage queue (strict-cascade routing —
 * there is no default/fallback department). Rule editing lives in Settings.
 */
export const RoutingStep = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sources, setSources] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([departmentService.getAll(), integrationsService.getAll()])
      .then(([depts, integrationsResponse]) => {
        setDepartments(depts);
        const list =
          integrationsResponse.success && integrationsResponse.data
            ? integrationsResponse.data
            : [];
        setSources(list.filter((item) => CHANNEL_TYPES.has(item.type) && !item.isKnowledgeBase));
      })
      .catch((err: unknown) => {
        logger.error('Failed to load routing overview:', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading…</div>;
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        Couldn&apos;t load your routing overview. You can review departments and channels anytime in
        Settings.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Here&apos;s how incoming messages will flow. Each message is analyzed and routed to the
        best-matching department based on your routing rules; anything that doesn&apos;t match goes
        to a triage queue for manual routing.
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4">
        <div className="flex items-center gap-2 text-sm">
          <Inbox className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">
            {sources.length > 0
              ? `${sources.length} connected ${sources.length === 1 ? 'channel' : 'channels'}`
              : 'No channels connected yet'}
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
        <div className="flex flex-wrap gap-1.5">
          {departments.map((dept) => (
            <span
              key={dept.id}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-foreground"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: dept.color ?? '#94a3b8' }}
                aria-hidden
              />
              {dept.name}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          Messages that don&apos;t match a department&apos;s rules land in the triage queue, where
          your team can route them by hand.
        </p>
        <p>
          You can fine-tune keyword routing rules and per-department settings anytime in{' '}
          <span className="font-medium text-foreground">Settings</span>.
        </p>
      </div>
    </div>
  );
};
