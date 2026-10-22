import type { AiStatus } from './aiStatus';
import { starterAllowanceLine } from './starterAllowance';

/**
 * "AI starter allowance: about N of 100 messages left." Free only (null elsewhere), and not on the
 * workspace's own key: the backend sends the block there too, but nothing draws on it. An older
 * backend sends none and nothing is rendered. Admins also read $.
 */
export const StarterAllowanceLine = ({
  ai,
  isAdmin,
  ownKey = false,
}: {
  ai: AiStatus | undefined;
  isAdmin: boolean;
  /** The workspace runs on its own AI key: the allowance is not in use, no line. */
  ownKey?: boolean;
}) => {
  const allowance = ai?.starterAllowance;
  if (!allowance || ownKey) return null;
  return (
    <p data-testid="starter-allowance-line" className="mb-4 text-sm text-foreground/80">
      {starterAllowanceLine(allowance, isAdmin)}
    </p>
  );
};
