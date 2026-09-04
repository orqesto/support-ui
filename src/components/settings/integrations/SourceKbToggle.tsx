import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toggle } from '@/components/ui/Toggle';

/**
 * The single control that promotes a channel to a Knowledge Base source.
 *
 * Under C-lite a KB source is not a different entity — it is the same
 * `message_sources` row with `isKnowledgeBase`. Turning it on stamps `kbMarkedAt`,
 * and the split is by TIME, not by channel: mail received BEFORE the stamp is mined
 * for Q&A pairs, mail after it keeps flowing to the inbox.
 *
 * That is why the copy says "past conversations" rather than the old
 * "use it as a KB source INSTEAD" framing — the two are not alternatives, and the
 * old wording sent people looking for a separate section that no longer exists.
 *
 * Lives in its own file so Email (IMAP) and Gmail present one identical control;
 * they previously disagreed — Email had a raw checkbox, Gmail had prose pointing at
 * the deleted "Knowledge Base Sources" section and no control at all.
 *
 * Switching it ON asks first. Mining sends every past conversation in the mailbox to the
 * AI provider — paid work, started by the save that follows, with no count or estimate
 * available up front (no endpoint reports how many conversations a source holds). A
 * one-click toggle that quietly commits to that is how a budget gets spent by accident;
 * switching OFF costs nothing and passes straight through.
 */
type SourceKbToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

export const KB_MINING_CONFIRM_DESCRIPTION =
  'Every past conversation in this mailbox will be sent to your AI provider to extract Q&A pairs once you save. That is billed AI usage, and there is no count or estimate available before it starts. Turn it on only if you want the whole history mined.';

export const SourceKbToggle = ({ checked, onChange, disabled }: SourceKbToggleProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleChange = (next: boolean) => {
    if (next) {
      setConfirmOpen(true);
      return;
    }
    onChange(false);
  };

  return (
    <div className="space-y-1">
      <Toggle
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        label="Mine past conversations for the Knowledge Base"
      />
      <p className="pl-11 text-xs text-muted-foreground">
        Extracts Q&amp;A pairs from mail received before this is switched on, so AI replies can
        draw on them. New mail keeps arriving in the inbox as usual.
      </p>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => onChange(true)}
        title="Mine this mailbox's history?"
        description={KB_MINING_CONFIRM_DESCRIPTION}
        confirmText="Mine past conversations"
        variant="warning"
      />
    </div>
  );
};
