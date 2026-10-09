import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { logger } from '@/lib/logger';
import { replyTemplatesService, type ReplyTemplate } from '@/services/replyTemplates.service';

/**
 * The reply templates one reply box may use (`thread` or `ticket`), read once per mount.
 * `templates` stays null until the server answers, on a backend without templates (404) and on
 * a failed read — in every one of those the box offers no template menu.
 */
export const useReplyTemplates = (use: 'thread' | 'ticket') => {
  const [templates, setTemplates] = useState<ReplyTemplate[] | null>(null);
  useEffect(() => {
    let live = true;
    replyTemplatesService
      .list(use)
      .then((result) => {
        if (live) setTemplates(result.unavailable ? null : result.templates);
      })
      .catch((err) => {
        logger.error('Failed to read the reply templates', err);
      });
    return () => {
      live = false;
    };
  }, [use]);
  return templates;
};

type Props = {
  use: 'thread' | 'ticket';
  /** The picked template — a copy: editing the template later changes nothing inserted. */
  onPick: (template: ReplyTemplate) => void;
  /** The trigger's text. */
  label?: string;
  disabled?: boolean;
  /** Classes for the trigger, so it can match the toolbar it sits in. */
  triggerClassName?: string;
};

/**
 * A "Templates" button opening a searchable list of the templates for this box. Renders nothing
 * while the list is unknown, on a backend without templates, and when there are none to offer —
 * a menu that opens empty is a dead control.
 */
export const TemplatePicker = ({
  use,
  onPick,
  label = 'Templates',
  disabled = false,
  triggerClassName,
}: Props) => {
  const templates = useReplyTemplates(use);
  if (!templates || templates.length === 0) return null;
  return (
    <Select
      variant="popover"
      aria-label={`${label}: choose a reply template`}
      options={templates.map((template) => ({ value: String(template.id), label: template.name }))}
      value=""
      searchable
      placeholder="Search templates by name…"
      popoverWidth={260}
      disabled={disabled}
      onChange={(value) => {
        const template = templates.find((row) => String(row.id) === value);
        if (template) onPick(template);
      }}
      trigger={({ toggle }) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggle}
          disabled={disabled}
          className={triggerClassName}
        >
          <FileText className="w-3 h-3 mr-1" aria-hidden />
          {label}
        </Button>
      )}
    />
  );
};
