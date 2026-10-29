import { BookOpen, CheckCircle2, ChevronDown, Clock, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem, MenuLabel } from '@/components/ui/Menu';

/**
 * What happens to the conversation after a reply goes out (2026-10-29, as Zendesk's submit-as).
 * `send` leaves the status to the automatic flow (a reply makes it wait on the customer).
 */
export type SendAction = 'send' | 'resolve' | 'resolve_kb' | 'hold';

export const SEND_ACTION_LABEL: Record<SendAction, string> = {
  send: 'Send',
  resolve: 'Send and resolve',
  resolve_kb: 'Send, resolve & save to KB',
  hold: 'Send and put on hold',
};

// The face of the button: short, so it fits a narrow panel beside the tools.
const FACE: Record<SendAction, string> = {
  send: 'SEND',
  resolve: 'SEND & RESOLVE',
  resolve_kb: 'SEND & RESOLVE + KB',
  hold: 'SEND & HOLD',
};

const ICON: Record<SendAction, React.ReactNode> = {
  send: <Send className="w-3.5 h-3.5" />,
  resolve: <CheckCircle2 className="w-3.5 h-3.5" />,
  resolve_kb: <BookOpen className="w-3.5 h-3.5" />,
  hold: <Clock className="w-3.5 h-3.5" />,
};

const SEGMENT =
  'flex items-center h-auto py-[5px] font-display text-[10.5px] font-semibold uppercase tracking-[0.07em] bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 max-sm:h-9';

/**
 * The reply's Send as a split button: the face sends with the agent's last choice, the chevron
 * picks another — picking one sends at once and becomes the new face.
 */
export function ComposerSendButton({
  action,
  actions,
  onSend,
  disabled,
  submitting,
  title,
}: {
  action: SendAction;
  /** Offered in this state; the face falls back to plain Send when its action is not. */
  actions: SendAction[];
  onSend: (action: SendAction) => void;
  disabled: boolean;
  submitting: boolean;
  title?: string;
}) {
  const face = actions.includes(action) ? action : 'send';
  return (
    <span className="inline-flex items-stretch rounded-[7px] overflow-hidden" title={title}>
      <Button
        variant="ghost"
        onClick={() => onSend(face)}
        disabled={disabled}
        aria-label={submitting ? 'SENDING…' : FACE[face]}
        className={`${SEGMENT} gap-1 px-[13px] rounded-none max-sm:px-3.5`}
      >
        <Send className="w-2.5 h-2.5" />
        {submitting ? 'SENDING…' : FACE[face]}
      </Button>
      {actions.length > 1 && (
        <Menu
          ariaLabel="Send options"
          align="end"
          width={260}
          trigger={({ toggle }) => (
            <Button
              variant="ghost"
              onClick={toggle}
              disabled={disabled}
              aria-label="Choose what happens after sending"
              className={`${SEGMENT} px-1.5 rounded-none border-l border-primary-foreground/25`}
            >
              <ChevronDown className="w-3 h-3" />
            </Button>
          )}
        >
          <MenuLabel>After sending</MenuLabel>
          {actions.map((option) => (
            <MenuItem
              key={option}
              icon={ICON[option]}
              checked={option === face}
              onSelect={() => onSend(option)}
            >
              {SEND_ACTION_LABEL[option]}
            </MenuItem>
          ))}
        </Menu>
      )}
    </span>
  );
}

const storageKey = (userId: number | string | undefined) => `odly.sendAction.${userId ?? 'anon'}`;

/** The agent's last choice, per agent on this browser. Storage can be blocked: never throw. */
export const readSendAction = (userId: number | string | undefined): SendAction => {
  try {
    const stored = window.localStorage.getItem(storageKey(userId));
    return stored && stored in FACE ? (stored as SendAction) : 'send';
  } catch {
    return 'send';
  }
};

export const writeSendAction = (userId: number | string | undefined, action: SendAction) => {
  try {
    window.localStorage.setItem(storageKey(userId), action);
  } catch {
    // Private window or blocked storage: the choice simply is not remembered.
  }
};
