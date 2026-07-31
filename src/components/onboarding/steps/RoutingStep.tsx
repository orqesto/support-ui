import { useEffect, useState } from 'react';
import { ArrowRight, Inbox, Star } from 'lucide-react';
import { departmentService, type Department } from '@/services/department.service';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { logger } from '@/lib/logger';

/**
 * Step 4 — read-only routing confirmation: active departments, the default
 * (fallback) department, and connected sources. Rule editing lives in
 * Settings → Routing (linked), not in the wizard.
 */
export const RoutingStep = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sources, setSources] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([departmentService.getAll(), integrationsService.getAll()])
      .then(([depts, integrationsResponse]) => {
        setDepartments(depts);
        const list =
          integrationsResponse.success && integrationsResponse.data
            ? integrationsResponse.data
            : [];
        setSources(
          list.filter(
            (item) => (item.type === 'gmail' || item.type === 'email') && !item.isKnowledgeBase
          )
        );
      })
      .catch((error: unknown) => {
        logger.error('Failed to load routing overview:', error);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading…</div>;
  }

  const fallback = departments.find((dept) => dept.isDefault);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Here&apos;s how incoming messages will flow. Each message is analyzed and routed to the
        best-matching department; anything unmatched lands in the default department.
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4">
        <div className="flex items-center gap-2 text-sm">
          <Inbox className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">
            {sources.length > 0
              ? `${sources.length} connected ${sources.length === 1 ? 'mailbox' : 'mailboxes'}`
              : 'No mailbox connected yet'}
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
              {dept.isDefault && <Star className="h-3 w-3 text-primary" />}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        {fallback && (
          <p>
            Unmatched messages go to{' '}
            <span className="font-medium text-foreground">{fallback.name}</span>.
          </p>
        )}
        <p>
          Fine-tune keyword rules and per-department routing anytime in{' '}
          <span className="font-medium text-foreground">Settings → Routing Rules</span>.
        </p>
      </div>
    </div>
  );
};
