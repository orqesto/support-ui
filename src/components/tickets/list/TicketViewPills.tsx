import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import type { TicketFilters } from '@/stores/ticketsStore';
import { activeView, filtersOfView, viewFiltersOf, type TicketView } from './ticketViews';

type TicketViewPillsProps = {
  filters: TicketFilters;
  views: TicketView[];
  /** Tickets in each view, by view name; undefined while unknown. */
  counts: Record<string, number | undefined>;
  onApply: (filters: TicketFilters) => void;
  onSave: (name: string) => Promise<void>;
  onDelete: (view: TicketView) => void;
};

/**
 * The tickets list's views as pills (Needs us · All · Mine · …, then the agent's own), each with
 * its count. The pill whose filters are exactly the current ones is lit; when none is and
 * something is filtered, "Save as view" keeps the current filters under a name.
 */
export const TicketViewPills = ({
  filters,
  views,
  counts,
  onApply,
  onSave,
  onDelete,
}: TicketViewPillsProps) => {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const current = activeView(filters, views);
  const custom = !current && (Object.keys(viewFiltersOf(filters)).length > 0 || !!filters.search?.trim());

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave(trimmed);
      setNaming(false);
      setName('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="group" aria-label="Saved views" className="flex flex-wrap gap-1.5 items-center">
      {views.map((view) => {
        const on = current === view;
        const count = counts[view.name];
        return (
          <span key={view.id ?? view.name} className="inline-flex relative items-center shrink-0 group/view">
            <Button
              variant="ghost"
              aria-pressed={on}
              onClick={() => onApply(filtersOfView(view.filters))}
              className={`h-[30px] px-3 gap-2 rounded-full border text-[12.5px] ${
                on
                  ? 'bg-primary border-primary text-primary-foreground font-semibold hover:bg-primary hover:text-primary-foreground'
                  : 'bg-card border-border text-muted-foreground font-medium hover:text-foreground'
              }`}
            >
              {view.name}
              {count !== undefined && <span className="font-mono text-[11px] opacity-75">{count}</span>}
            </Button>
            {!view.builtIn && (
              <Button
                variant="ghost"
                onClick={() => onDelete(view)}
                aria-label={`Delete view ${view.name}`}
                className="grid absolute -top-1 -right-1 place-items-center p-0 w-4 h-4 rounded-full opacity-0 transition-opacity bg-muted text-muted-foreground group-hover/view:opacity-100 focus:opacity-100 hover:text-destructive"
              >
                <X className="w-2.5 h-2.5" />
              </Button>
            )}
          </span>
        );
      })}
      {custom && (
        <Button
          variant="ghost"
          onClick={() => setNaming(true)}
          className="h-[30px] px-3 gap-1.5 rounded-full border border-dashed border-border text-[12.5px] text-muted-foreground"
        >
          <Plus className="w-3.5 h-3.5" />
          Save as view
        </Button>
      )}
      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogHeader>
          <DialogTitle>Save as view</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="grid gap-1.5">
            <Label htmlFor="ticket-view-name">Name</Label>
            <Input
              id="ticket-view-name"
              value={name}
              maxLength={60}
              placeholder="e.g. Billing incidents"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save();
              }}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setNaming(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!name.trim()} isLoading={saving}>
            Save
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};
