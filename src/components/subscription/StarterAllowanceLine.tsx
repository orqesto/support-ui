import type { AiStatus } from './aiStatus';
import { starterAllowanceLine } from './starterAllowance';

/**
 * "AI starter allowance: about N of 100 messages left." Free only (null elsewhere), and only while
 * the workspace is on our AI: the backend sends the block on an own key too, where nothing draws on it. An older
 * backend sends none and nothing is rendered. Admins also read $.
 */
export const StarterAllowanceLine = ({
  ai,
  isAdmin,
  inUse = true,
}: {
  ai: AiStatus | undefined;
  isAdmin: boolean;
  /**
   * The workspace runs on our AI (aiSourceOf → 'starter'). False on its own key, or in own-key
   * mode with no provider: nothing draws on the allowance, no line.
   */
  inUse?: boolean;
}) => {
  const allowance = ai?.starterAllowance;
  if (!allowance || !inUse) return null;
  return (
    <p data-testid="starter-allowance-line" className="mb-4 text-sm text-foreground/80">
      {starterAllowanceLine(allowance, isAdmin)}
    </p>
  );
};
