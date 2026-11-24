import { Toggle } from '@/components/ui/Toggle';
import {
  DOSE_RULE_ADMIN_ONLY,
  DOSE_RULE_HELP,
  DOSE_RULE_TITLE,
  HOLD_PHRASES_LABEL,
  HOLD_REPLIES_HELP,
  HOLD_REPLIES_TITLE,
  NO_HOLD_PHRASES_TEXT,
  RestrictedTopicsField,
  TopicsReadOnly,
} from './RestrictedTopicsField';
import { holdPhraseProblem } from './restrictedTopics';

type Props = {
  /** The workspace's own phrases; null = an older backend without the list (no list is offered). */
  phrases: readonly string[] | null;
  /** The built-in amount rule; null = an older backend without the switch. */
  amountRule: boolean | null;
  /** Only a workspace admin may change these (the backend refuses anyone else). */
  canChange: boolean;
  disabled: boolean;
  /** Saves the WHOLE list; resolves false when it was not saved. */
  onSavePhrases: (phrases: string[]) => Promise<boolean>;
  onSaveAmountRule: (on: boolean) => void;
};

/**
 * "Hold automatic replies that contain…" (2026-11-24): words or phrases the workspace lists, none
 * by default, and the built-in amount rule beside them. Either one holds an automatic reply for a
 * person on every automatic path.
 */
export const HoldRepliesSection = ({
  phrases,
  amountRule,
  canChange,
  disabled,
  onSavePhrases,
  onSaveAmountRule,
}: Props) => {
  if (phrases === null && amountRule === null) return null;
  return (
    <div className="pt-3 space-y-2 border-t">
      <p id="hold-replies-title" className="text-sm font-medium">
        {HOLD_REPLIES_TITLE}
      </p>
      <p className="text-xs text-muted-foreground">{HOLD_REPLIES_HELP}</p>
      {phrases !== null &&
        (canChange ? (
          <RestrictedTopicsField
            label={HOLD_PHRASES_LABEL}
            topics={phrases}
            emptyText={NO_HOLD_PHRASES_TEXT}
            placeholder='e.g. "refund*", "contract"'
            disabled={disabled}
            problemOf={holdPhraseProblem}
            removeLabel="Remove"
            onAdd={(phrase) => onSavePhrases([...phrases, phrase.replace(/\s+/g, ' ')])}
            onRemove={(phrase) => onSavePhrases(phrases.filter((entry) => entry !== phrase))}
          />
        ) : (
          <TopicsReadOnly
            label={HOLD_PHRASES_LABEL}
            topics={phrases}
            emptyText={NO_HOLD_PHRASES_TEXT}
          />
        ))}
      {amountRule !== null && (
        <div className="flex justify-between items-center pt-1">
          <div>
            <p id="dose-rule-title" className="text-sm font-medium">
              {DOSE_RULE_TITLE}
            </p>
            <p id="dose-rule-help" className="text-xs text-muted-foreground">
              {DOSE_RULE_HELP}
            </p>
          </div>
          <Toggle
            checked={amountRule}
            ariaLabel={DOSE_RULE_TITLE}
            ariaDescribedBy={canChange ? 'dose-rule-help' : 'dose-rule-help dose-rule-admin-only'}
            disabled={disabled || !canChange}
            onChange={onSaveAmountRule}
          />
        </div>
      )}
      {/* Out of use for anyone but a workspace admin (the backend's rule): said. */}
      {!canChange && (
        <p id="dose-rule-admin-only" className="text-xs text-muted-foreground">
          {DOSE_RULE_ADMIN_ONLY}
        </p>
      )}
    </div>
  );
};
