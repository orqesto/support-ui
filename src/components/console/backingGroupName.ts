import type { OrganizationRole } from '@/types/roles';

export const ORG_ROLE_LABELS: Record<OrganizationRole, string> = {
  org_admin: 'Org admin',
  moderator: 'Moderator',
  support: 'Support',
  associate: 'Associate',
};

/**
 * The name "Map access → new group" gives the backing group it mints: the IdP group's name
 * and the role it grants. A minted group's name FOLLOWS this — the editor re-derives it when
 * the role changes and never lets it be typed — so the Groups list and the Provisioning row
 * keep reading as one thing.
 */
export const backingGroupName = (displayName: string, role: OrganizationRole): string =>
  `${displayName} — ${ORG_ROLE_LABELS[role]}`.slice(0, 120);
