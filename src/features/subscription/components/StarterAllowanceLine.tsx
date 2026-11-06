import type { AiStatus } from './aiStatus';
import { kbAllowanceLine, starterAllowanceLine } from './starterAllowance';

/**
 * "AI starter allowance: about N of 100 messages left." and, under it, the knowledge-base /
 * history-import allowance ("about N% left"). Each line hides when its block is null. Free only (null elsewhere), and only while
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
  const kbAllowance = ai?.kbStarterAllowance;
  if (!inUse || (!allowance && !kbAllowance)) return null;
  return (
    <div className="mb-4 space-y-1 text-sm text-foreground/80">
      {allowance && (
        <p data-testid="starter-allowance-line">{starterAllowanceLine(allowance, isAdmin)}</p>
      )}
      {kbAllowance && (
        <p data-testid="kb-allowance-line">{kbAllowanceLine(kbAllowance, isAdmin)}</p>
      )}
    </div>
  );
};
