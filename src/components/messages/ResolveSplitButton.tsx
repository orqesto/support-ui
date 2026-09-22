import { useEffect, useRef, useState } from 'react';
import { Ban, BookOpen, Check, ChevronDown, Trash2 } from 'lucide-react';
import type { ResolveMode } from './resolveMode';

export type ResolveSplitButtonProps = {
  /** Decides whether this renders at all and which variants it offers — see resolveMode.ts. */
  mode: ResolveMode;
  busy?: boolean;
  /**
   * The one-press resolve. Opens the SAME confirm dialog the old footer's "Resolve (no KB)"
   * did — close() for an active conversation, the reject dialog for an unreviewed one — so
   * moving the control to the header adds no new path to the backend.
   */
  onResolve: () => void;
  /** Active only: an unreviewed conversation has no answer to capture. */
  onResolveToKb?: () => void;
  /** Confirmed spam: the agent's own decision (see below). */
  onMoveToSpam?: () => void;
  onNotCustomerWork?: () => void;
};

type Item = {
  key: string;
  label: string;
  icon: JSX.Element;
  onSelect: () => void;
  danger?: boolean;
};

/**
 * Resolve as a split button: the common case is one press, the variants live under the caret.
 *
 * "Resolve & move to spam" is the agent's decision that this is spam, recorded as CONFIRMED
 * (`move_to_spam` + `confirm`). Owner, 2026-09-22 — two layers of spam: what our filters bin is
 * unconfirmed until a person acts; an agent resolving it as spam confirms it. This supersedes
 * the SP-D5 wording rule for this control. Note the thread lands in Spam (confirmed), not in
 * the Resolved column: the status stays `filtered`.
 *
 * ⛔ "Not customer work" lives here although the design omits it: it was on the footer this
 * replaces, and it is the only way to clear a newsletter off the queue WITHOUT claiming anyone
 * answered it. Dropping the footer must not drop the action.
 */
export function ResolveSplitButton({
  mode,
  busy = false,
  onResolve,
  onResolveToKb,
  onMoveToSpam,
  onNotCustomerWork,
}: ResolveSplitButtonProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Consumed here, so the detail view's own Esc (close the rail) does not also fire.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      caretRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (mode === null) return null;

  const items: Item[] = [];
  if (mode === 'active' && onResolveToKb) {
    items.push({
      key: 'kb',
      label: 'Resolve & save to KB',
      icon: <BookOpen className="w-3.5 h-3.5" />,
      onSelect: onResolveToKb,
    });
  }
  if (onNotCustomerWork) {
    items.push({
      key: 'ncw',
      label: 'Not customer work',
      icon: <Ban className="w-3.5 h-3.5" />,
      onSelect: onNotCustomerWork,
    });
  }
  if (onMoveToSpam) {
    items.push({
      key: 'spam',
      label: 'Resolve & move to spam',
      icon: <Trash2 className="w-3.5 h-3.5" />,
      onSelect: onMoveToSpam,
      danger: true,
    });
  }

  const base =
    'inline-flex items-center h-[27px] font-display text-[12px] font-semibold bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50 transition-[filter]';

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={onResolve}
        disabled={busy}
        // E opens the same dialog; it acts exactly when this button is shown (same resolveMode).
        title="Resolve (E)"
        className={`${base} gap-1.5 px-[11px] ${items.length > 0 ? 'rounded-l-[7px]' : 'rounded-[7px]'}`}
      >
        <Check className="w-3.5 h-3.5" />
        Resolve
      </button>
      {items.length > 0 && (
        <button
          ref={caretRef}
          type="button"
          aria-label="Other resolve options"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          disabled={busy}
          className={`${base} px-[5px] ml-px rounded-r-[7px] shadow-[inset_1px_0_0_rgba(255,255,255,.22)]`}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      )}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={index === 0 ? firstItemRef : undefined}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none ${
                item.danger ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
