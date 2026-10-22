import { useAuthStore } from '@/stores/authStore';
import { isOrgAdminOrHigher } from '@/types/roles';
import { aiRefusalText } from './starterAllowance';

/** `aiRefusalText` for the signed-in user (an organisation admin or higher reads the admin text). */
export const useAiRefusalText = () => {
  const user = useAuthStore((state) => state.user);
  const isAdmin = !!user && isOrgAdminOrHigher(user.role, user.organizationRole);
  return (err: unknown) => aiRefusalText(err, isAdmin);
};
