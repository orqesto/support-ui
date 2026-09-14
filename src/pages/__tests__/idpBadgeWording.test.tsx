/**
 * The badge must say what is true NOW.
 *
 * `scimManaged` is true for any account the IdP ever created, because `auth_provider='scim'`
 * never clears. Three accounts on a live workspace therefore read "IdP-managed" while the
 * directory had no current relationship with any of them — no group, no alliance membership,
 * no access — and the admin went looking for a group that did not exist.
 *
 * The guards keep the broad signal (a JumpCloud user can legitimately have no externalId and
 * no group yet); only the wording narrows.
 */
import { describe, it, expect } from 'vitest';

/** Mirrors the branch in UsersPage.scimBadge. */
const badgeFor = (user: { scimManaged?: boolean; idpLinkActive?: boolean }) => {
  if (!user.scimManaged) return null;
  return user.idpLinkActive === false ? 'Created by IdP' : 'IdP-managed';
};

describe('IdP badge wording', () => {
  it('says "Created by IdP" when the directory no longer manages the account', () => {
    expect(badgeFor({ scimManaged: true, idpLinkActive: false })).toBe('Created by IdP');
  });

  it('says "IdP-managed" when the relationship is live', () => {
    expect(badgeFor({ scimManaged: true, idpLinkActive: true })).toBe('IdP-managed');
  });

  it('treats an ABSENT idpLinkActive as live, not as "created only"', () => {
    // Older backends omit the field. Reading undefined as false would relabel every managed
    // member on the platform the moment the FE shipped ahead of the API.
    expect(badgeFor({ scimManaged: true })).toBe('IdP-managed');
  });

  it('shows no badge at all for an ordinary in-app account', () => {
    expect(badgeFor({ scimManaged: false, idpLinkActive: false })).toBeNull();
    expect(badgeFor({})).toBeNull();
  });
});
