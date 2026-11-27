/** The route pattern App.tsx mounts the new-team page on. */
export const TEAM_NEW_ROUTE = '/settings/teams/new';

/** The route pattern for one team's page. */
export const TEAM_PAGE_ROUTE = '/settings/teams/:teamId';

export const teamPagePath = (id: number): string => `/settings/teams/${id}`;
