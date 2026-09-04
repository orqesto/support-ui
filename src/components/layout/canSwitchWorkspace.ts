/**
 * Whether this user can move the session to another workspace from inside the app.
 *
 * ONE predicate, shared by the two surfaces that reason about it:
 *   - `OrganizationSwitcher` — the control that performs the switch;
 *   - `WorkspaceBanner` — the line above every screen naming the workspace you are about to
 *     write to, which exists BECAUSE a switch is possible.
 *
 * They used to disagree. The switcher rendered for a global admin OR anyone with two or
 * more memberships; the banner rendered for global admins only. So a multi-workspace
 * org_admin (or an alliance_admin materialised into every member workspace) could switch
 * and then write with no banner at all — exactly the class of slip the banner was added
 * for (2026-08-16, a `reply_style` activation applied to the wrong tenant).
 *
 * A global admin switches by context header and needs no membership list, so the answer
 * for them does not wait on a fetch. Everyone else needs two memberships to have anything
 * to switch to.
 */
export const canSwitchWorkspace = (
  user: { role?: string | null } | null | undefined,
  organizations: ReadonlyArray<unknown>
): boolean => user?.role === 'admin' || organizations.length >= 2;
