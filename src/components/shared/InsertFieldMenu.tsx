import { Braces, ChevronDown } from 'lucide-react';
import type { RefObject } from 'react';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem, MenuLabel, MenuNote } from '@/components/ui/Menu';

/** The merge fields the server fills per customer at send time (replyPlaceholders.ts, BE). */
const FIELDS: Array<{ token: string; means: string }> = [
  { token: '{first_name}', means: 'Customer’s first name — “there” if unknown' },
  { token: '{customer_name}', means: 'Full name — add a fallback: {customer_name|there}' },
  { token: '{ticket_id}', means: 'This ticket’s number' },
  { token: '{thread_id}', means: 'The customer’s own thread reference' },
  { token: '{agent_name}', means: 'Your name' },
];

export const InsertFieldMenu = ({
  onInsert,
  editor,
  disabled,
  triggerClassName,
  ticketIdHint,
  iconOnly = false,
}: {
  onInsert?: (token: string) => void;
  /** Or insert straight into a rich-text editor, at its caret. */
  editor?: RefObject<RichTextEditorHandle | null>;
  disabled?: boolean;
  /** A toolbar's own button style (the thread reply box); the trigger is then a ghost button. */
  triggerClassName?: string;
  /**
   * What `{ticket_id}` means where the menu is. Outside a ticket it is filled only when the thread
   * is on one — otherwise the server refuses the send — so the box says so.
   */
  ticketIdHint?: string;
  /** Icon only (a narrow reply toolbar); the name stays for screen readers and on hover. */
  iconOnly?: boolean;
}) => {
  const insert = (token: string) =>
    onInsert ? onInsert(token) : editor?.current?.insertText(token);
  const iconSize = triggerClassName ? 'w-3 h-3' : 'w-4 h-4';
  return (
    <Menu
      ariaLabel="Insert a field"
      width={340}
      trigger={({ toggle }) => (
        <Button
          size="sm"
          variant={triggerClassName ? 'ghost' : 'outline'}
          type="button"
          onClick={toggle}
          disabled={disabled}
          className={triggerClassName}
          title={iconOnly ? 'Insert field' : undefined}
        >
          <Braces className={iconOnly ? iconSize : `mr-1 ${iconSize}`} aria-hidden />
          {iconOnly ? <span className="sr-only">Insert field</span> : 'Insert field'}
          {!iconOnly && <ChevronDown className="ml-1 w-3.5 h-3.5" aria-hidden />}
        </Button>
      )}
    >
      <MenuLabel>Insert a field</MenuLabel>
      {FIELDS.map((field) => (
        <MenuItem
          key={field.token}
          onSelect={() => insert(field.token)}
          hint={field.token === '{ticket_id}' && ticketIdHint ? ticketIdHint : field.means}
        >
          <span className="font-mono text-xs">{field.token}</span>
        </MenuItem>
      ))}
      <MenuNote>Add a fallback for unknown names: {'{customer_name|there}'}</MenuNote>
    </Menu>
  );
};
