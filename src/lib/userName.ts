/**
 * A person's display name from first and last name, skipping a part that is missing.
 *
 * Template literals print a missing part as the word "null": a user saved without a last name
 * showed as "moderator null (moderator)" in the assignee picker (staging, 2026-10-31). Every
 * place that joins the two goes through here.
 */
export interface NamedUser {
  firstName?: string | null;
  lastName?: string | null;
}

export const userFullName = (user: NamedUser): string =>
  [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
