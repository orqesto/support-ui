import { createContext, useContext, type ReactNode } from 'react';
import { fmtMoneyTokens } from './budget.rules';

/** The price of one token (micros) in the budget on screen, or null; see `microsPerToken`. */
const TokenRateContext = createContext<number | null>(null);

export const TokenRateProvider = ({
  rate,
  children,
}: {
  rate: number | null;
  children: ReactNode;
}) => <TokenRateContext.Provider value={rate}>{children}</TokenRateContext.Provider>;

export const useTokenRate = (): number | null => useContext(TokenRateContext);

/** Money with its tokens beside it: "≈ $40.00 (9.6M tokens)" (just the money with no price). */
export const useMoney = (): ((micros: number) => string) => {
  const rate = useTokenRate();
  return (micros) => fmtMoneyTokens(micros, rate);
};
