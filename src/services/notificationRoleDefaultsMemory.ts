/** Workspaces whose server has no role-defaults endpoint, remembered for the session (no re-probe). */
export const roleDefaultsUnavailable = new Set<string>();

/** Test-only: forget which workspaces were found unavailable. */
export const resetRoleDefaultsUnavailableForTests = (): void => roleDefaultsUnavailable.clear();
