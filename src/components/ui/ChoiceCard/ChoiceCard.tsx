import { Card, CardContent } from '../Card';
import { inactiveButtonProps } from '../Button/inactiveProps';
import { getChoiceCardButtonClasses, getChoiceCardClasses } from './choiceCard.styles';
import type { ChoiceCardProps } from './choiceCard.types';

/**
 * One option of a "pick one" grid drawn as a card — the onboarding AI, storage, database and plan
 * steps and the AI provider mode switch. Five copies of the same hand-built <button> + Card lived
 * in those screens until 2026-11-03; this is that pattern, once. A card that is not selectable at
 * all (e.g. "Coming soon") is a plain Card, not a ChoiceCard.
 */
export const ChoiceCard = ({
  selected,
  onSelect,
  disabled = false,
  contentClassName = 'space-y-2 p-5',
  className,
  'data-testid': testId,
  children,
}: ChoiceCardProps) => (
  <button
    type="button"
    aria-pressed={selected}
    data-testid={testId}
    className={getChoiceCardButtonClasses(className)}
    {...inactiveButtonProps(disabled, onSelect)}
  >
    <Card className={getChoiceCardClasses(selected, disabled)}>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  </button>
);
