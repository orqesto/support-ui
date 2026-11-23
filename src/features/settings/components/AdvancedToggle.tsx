import { Toggle } from '@/components/ui/Toggle';
import { useShowAdvanced } from '@/features/settings/advanced';

/**
 * The one switch for "Show advanced settings". `onTurnOff` runs from the user's own click only,
 * never from an effect: a tab uses it to move off a section that just became hidden, and an
 * effect would also fire on mount and push every deep link out.
 */
export const AdvancedToggle = ({ onTurnOff }: { onTurnOff?: () => void }) => {
  const [show, setShow] = useShowAdvanced();
  return (
    <Toggle
      checked={show}
      onChange={(next) => {
        setShow(next);
        if (!next) onTurnOff?.();
      }}
      label="Show advanced settings"
      ariaLabel="Show advanced settings"
    />
  );
};
