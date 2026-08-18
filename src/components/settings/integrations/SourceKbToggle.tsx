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
 */
type SourceKbToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

export const SourceKbToggle = ({ checked, onChange, disabled }: SourceKbToggleProps) => (
  <div className="space-y-1">
    <Toggle
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      label="Mine past conversations for the Knowledge Base"
    />
    <p className="pl-11 text-xs text-muted-foreground">
      Extracts Q&amp;A pairs from mail received before this is switched on, so AI replies can
      draw on them. New mail keeps arriving in the inbox as usual.
    </p>
  </div>
);
