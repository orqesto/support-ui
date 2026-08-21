import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Token } from './filterTokens';

/**
 * One active filter, as a two-part chip: a muted name half and a clickable value half.
 *
 * The value half reopens that filter's picker in place. Changing a filter used to mean
 * finding its dropdown again in a panel of a dozen; here the thing you want to change
 * is the thing you click.
 */
export const FilterToken = ({
  token,
  onEdit,
  onRemove,
  /** Touch has no hover, so the × cannot hide behind one. */
  alwaysShowRemove = false,
}: {
  token: Token;
  onEdit: () => void;
  onRemove: () => void;
  alwaysShowRemove?: boolean;
}) => {
  const { def, text, dot } = token;
  const tone =
    def.tone === 'red'
      ? 'border-destructive/40 text-red-600 dark:text-red-400'
      : def.tone === 'amber'
        ? 'border-warning/50 text-amber-600 dark:text-amber-400'
        : 'border-border';

  return (
    <span
      className={`flex overflow-hidden items-stretch h-7 rounded-md border shrink-0 text-[12.5px] group bg-card dark:bg-accent ${tone}`}
    >
      {def.kind !== 'flag' && (
        <span className="grid place-items-center px-2 font-medium border-r text-muted-foreground border-border bg-muted dark:bg-input">
          {def.label.toLowerCase()}
        </span>
      )}
      <Button
        variant="ghost"
        onClick={onEdit}
        aria-label={`Change ${def.label}`}
        className="flex gap-1.5 items-center px-2 h-auto font-semibold rounded-none hover:bg-accent max-w-[220px]"
      >
        {dot && (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
        )}
        <span className="truncate">{text}</span>
      </Button>
      <Button
        variant="ghost"
        onClick={onRemove}
        aria-label={`Remove ${def.label} filter`}
        className={`grid place-items-center px-1.5 h-auto rounded-none border-l text-muted-foreground border-border hover:text-red-600 dark:hover:text-red-400 hover:bg-destructive/10 dark:hover:bg-destructive/20 ${
          alwaysShowRemove ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
        }`}
      >
        <X className="w-2.5 h-2.5" />
      </Button>
    </span>
  );
};
