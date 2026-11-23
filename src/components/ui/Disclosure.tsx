import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * A collapsed panel with a one-line summary in its header (owner, 2026-09-29: the common case
 * needs none of what is inside, and the closed header says WHAT differs, so nobody is surprised by
 * a setting they cannot see).
 *
 * · Children stay MOUNTED while closed (the `hidden` attribute), so a value typed but not saved
 *   survives closing it. No display utility sits on that element: a display class overrides
 *   `[hidden]` in a real browser while jsdom's `toBeVisible` would still pass.
 * · `open` / `onOpenChange` make it controlled.
 * · `openOnce` (for a validation error inside): while true the panel is open and cannot be closed;
 *   on its rising edge it opens for good, so the field does not vanish when the next keystroke
 *   clears the error.
 */
export const Disclosure = ({
  title,
  summary,
  children,
  open: controlledOpen,
  onOpenChange,
  openOnce = false,
}: {
  title: string;
  summary: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  openOnce?: boolean;
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  useEffect(() => {
    if (openOnce) setInternalOpen(true);
  }, [openOnce]);
  const isControlled = controlledOpen !== undefined;
  const open = (isControlled ? controlledOpen : internalOpen) || openOnce;
  const toggle = () => {
    if (openOnce) return;
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  return (
    <div className="rounded-md border">
      <Button
        variant="ghost"
        className="flex justify-between items-center px-3 py-2 w-full h-auto text-sm font-medium text-left hover:bg-transparent"
        onClick={toggle}
        aria-expanded={open}
      >
        <span className="flex flex-col gap-0.5">
          <span>{title}</span>
          <span className="text-xs font-normal text-muted-foreground">{summary}</span>
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0" />
        )}
      </Button>
      <div hidden={!open}>
        <div className="p-3 space-y-3 border-t">{children}</div>
      </div>
    </div>
  );
};
