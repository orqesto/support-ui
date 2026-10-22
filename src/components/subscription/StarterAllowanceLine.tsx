import type { AiStatus } from './aiStatus';
import { starterAllowanceLine } from './starterAllowance';

/**
 * "AI starter allowance: about N of 100 messages left." Free on our key only (the backend sends the
 * field nowhere else); an older backend sends none and nothing is rendered. Admins also read $.
 */
export const StarterAllowanceLine = ({
  ai,
  isAdmin,
}: {
  ai: AiStatus | undefined;
  isAdmin: boolean;
}) => {
  const allowance = ai?.starterAllowance;
  if (!allowance) return null;
  return (
    <p data-testid="starter-allowance-line" className="mb-4 text-sm text-foreground/80">
      {starterAllowanceLine(allowance, isAdmin)}
    </p>
  );
};
