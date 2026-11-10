import { useCallback } from 'react';
import { useIsWorkspaceAdmin } from '@/hooks/useIsWorkspaceAdmin';
import { aiRefusalText } from './starterAllowance';

/** `aiRefusalText` for the signed-in user (an organisation admin or higher reads the admin text). */
export const useAiRefusalText = () => {
  const isAdmin = useIsWorkspaceAdmin();
  return useCallback((err: unknown) => aiRefusalText(err, isAdmin), [isAdmin]);
};

