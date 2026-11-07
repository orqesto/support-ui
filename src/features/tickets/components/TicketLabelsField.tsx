import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { labelPickerEmptyText, type LabelsStatus } from '@/components/shared/labelPickerText';
import { hashNameToLabelColor } from '@/components/messages/inboxCardHelpers';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { logger } from '@/lib/logger';
import { solidChip } from '@/lib/userColor';
import { labelService, type Label } from '@/services/settings.service';

/**
 * The ticket's labels in the properties sidebar: chips, and "+ Label" — a search-or-create picker
 * for whoever may manage labels. Shown only to someone who may view labels (the caller checks).
 */
export const TicketLabelsField = ({
  ticketId,
  canManage,
}: {
  ticketId: number;
  canManage: boolean;
}) => {
  const hasManageLabels = canManage;
  const [ticketLabels, setTicketLabels] = useState<Label[]>([]);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [labelsStatus, setLabelsStatus] = useState<LabelsStatus>('loading');
  /** Bumped to fetch the labels again (the picker reopened after a failed load). */
  const [labelsAttempt, setLabelsAttempt] = useState(0);
  // Bumped after a label is created: remounting the picker closes it, as the old panel did.
  const [labelPickerKey, setLabelPickerKey] = useState(0);

  const handleCreateLabel = async (name: string) => {
    try {
      const created = await labelService.createLabel({
        name,
        color: hashNameToLabelColor(name),
      });
      setAllLabels((prev) => [created, ...prev]);
      setTicketLabels((prev) => [...prev, created]);
      try {
        await labelService.assignLabelToTicket(ticketId, created.id);
      } catch (assignErr) {
        logger.error('Failed to assign newly-created label:', assignErr);
        setTicketLabels((prev) => prev.filter((lbl) => lbl.id !== created.id));
      }
      setLabelPickerKey((key) => key + 1);
    } catch (err) {
      logger.error('Failed to create label:', err);
    }
  };

  useEffect(() => {
    /*
     * Only the latest request's answer lands. The pages mount one TicketDetail per ticket (keyed
     * by id), so a reply for another ticket cannot arrive here — but a retry (labelsAttempt)
     * re-runs this effect, and a superseded attempt's late reply must not overwrite a newer one.
     */
    let live = true;
    setLabelsStatus('loading');
    Promise.all([labelService.getTicketLabels(ticketId), labelService.getLabels()])
      .then(([tl, al]) => {
        if (!live) return;
        setTicketLabels(tl);
        setAllLabels(al);
        setLabelsStatus('ready');
      })
      .catch((err) => {
        if (!live) return;
        logger.error(err);
        setLabelsStatus('error');
      });
    return () => {
      live = false;
    };
  }, [ticketId, labelsAttempt]);

  const handleToggleLabel = async (label: Label) => {
    const assigned = ticketLabels.some((lbl) => lbl.id === label.id);
    try {
      if (assigned) {
        await labelService.removeLabelFromTicket(ticketId, label.id);
        setTicketLabels((prev) => prev.filter((lbl) => lbl.id !== label.id));
      } else {
        await labelService.assignLabelToTicket(ticketId, label.id);
        setTicketLabels((prev) => [...prev, label]);
      }
    } catch (error) {
      logger.error('Failed to toggle label:', error);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-[5px]">
      {ticketLabels.map((label) => (
        <span
          key={label.id}
          className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-medium"
          style={solidChip(label.color)}
        >
          {label.name}
          {hasManageLabels && (
            <Button
              aria-label={`Remove ${label.name}`}
              variant="ghost"
              size="icon"
              onClick={() => handleToggleLabel(label)}
              className="p-0 w-auto h-auto opacity-70 hover:opacity-100 ml-0.5 hover:bg-transparent"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </span>
      ))}
      {ticketLabels.length === 0 && !hasManageLabels && (
        <span className="text-muted-foreground/70 font-normal">None</span>
      )}
      {hasManageLabels && (
        <Select
          key={labelPickerKey}
          variant="popover"
          multi
          aria-label="Labels"
          options={allLabels.map((label) => ({
            value: String(label.id),
            label: label.name,
            color: label.color,
          }))}
          value={ticketLabels.map((label) => String(label.id))}
          onChange={(next) => {
            // The panel ticks one label per press: find it and run the same toggle as the chips.
            // Select hands back applied labels it does not list untouched, so the plain
            // difference between the two sets is exactly the one label pressed.
            const before = new Set(ticketLabels.map((label) => String(label.id)));
            const after = new Set(next);
            const changed =
              next.find((id) => !before.has(id)) ?? [...before].find((id) => !after.has(id));
            const label = allLabels.find((lbl) => String(lbl.id) === changed);
            if (label) void handleToggleLabel(label);
          }}
          // Only once the list is known: before that "Create Bug" would duplicate an existing Bug.
          creatable={hasManageLabels && labelsStatus === 'ready'}
          // The same wording as the message header's label picker (one helper for both).
          noOptionsMessage={() =>
            labelPickerEmptyText(labelsStatus, allLabels.length, hasManageLabels)
          }
          onCreate={(name) => void handleCreateLabel(name)}
          placeholder={
            hasManageLabels && labelsStatus === 'ready' ? 'Search or create…' : 'Search…'
          }
          // A failed load is retried each time the picker opens — not a dead end.
          onOpenChange={(open) => {
            if (open && labelsStatus === 'error') setLabelsAttempt((attempt) => attempt + 1);
          }}
          trigger={({ toggle }) => (
            <Tooltip content="Add label" size="sm">
              <Button
                size="sm"
                variant="outline"
                className="h-[22px] gap-1 px-2 rounded-full border-dashed text-[11.5px] font-normal text-muted-foreground hover:text-primary"
                onClick={toggle}
                aria-label="Add label"
              >
                <Plus className="w-3 h-3" />
                Label
              </Button>
            </Tooltip>
          )}
        />
      )}
    </div>
  );
};
