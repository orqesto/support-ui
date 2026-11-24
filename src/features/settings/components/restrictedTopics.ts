/**
 * Restricted topics (send gate, 2026-11-20): subjects an automatic reply is never sent on. The
 * limits mirror the backend's schema for PATCH /api/organizations/auto-reply (each list — the
 * workspace's, and every team's own — holds 50 entries of 200 characters, trimmed, not empty, no
 * repeat whatever the letter case); the server checks again. There are no locked topics: a
 * workspace that never saved a list gets the server's defaults as ordinary, removable entries.
 */

import { getErrorBody } from '@/lib/errorMessages';

export const RESTRICTED_TOPICS_MAX = 50;
export const RESTRICTED_TOPIC_MAX_CHARS = 200;

/** The stored list as the page uses it: strings only, or null when the backend sent no list. */
export const readRestrictedTopics = (value: unknown): string[] | null =>
  Array.isArray(value)
    ? value.filter((topic): topic is string => typeof topic === 'string' && topic.trim() !== '')
    : null;

const sameTopic = (left: string, right: string): boolean =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

/**
 * Why `draft` cannot be added to `own`, or null when it can. `alsoApplies` are the topics that
 * hold for this list anyway (a team: the workspace's), so adding one of them again says nothing.
 */
export const restrictedTopicProblem = (
  draft: string,
  own: readonly string[],
  alsoApplies: readonly string[] = []
): string | null => {
  const topic = draft.trim();
  if (!topic) return 'Type a topic first.';
  if (topic.length > RESTRICTED_TOPIC_MAX_CHARS) {
    return `A topic can be up to ${RESTRICTED_TOPIC_MAX_CHARS} characters (this one has ${topic.length}).`;
  }
  if (own.some((entry) => sameTopic(entry, topic))) return 'This topic is already on the list.';
  if (alsoApplies.some((entry) => sameTopic(entry, topic))) {
    return 'This is already a workspace topic, so it applies to this team.';
  }
  if (own.length >= RESTRICTED_TOPICS_MAX) {
    return `A list can hold up to ${RESTRICTED_TOPICS_MAX} topics. Remove one first.`;
  }
  return null;
};

/** "Hold automatic replies that contain…": the backend's limits (50 entries of 100 characters). */
export const HOLD_PHRASES_MAX = 50;
export const HOLD_PHRASE_MAX_CHARS = 100;

/** Why `draft` cannot be added to the held phrases, or null when it can. */
export const holdPhraseProblem = (draft: string, own: readonly string[]): string | null => {
  const phrase = draft.trim().replace(/\s+/g, ' ');
  if (!phrase || phrase.replaceAll('*', '') === '') return 'Type a word or phrase first.';
  if (phrase.length > HOLD_PHRASE_MAX_CHARS) {
    return `An entry can be up to ${HOLD_PHRASE_MAX_CHARS} characters (this one has ${phrase.length}).`;
  }
  if (own.some((entry) => sameTopic(entry, phrase))) return 'This is already on the list.';
  if (own.length >= HOLD_PHRASES_MAX) {
    return `The list can hold up to ${HOLD_PHRASES_MAX} entries. Remove one first.`;
  }
  return null;
};

/** The stored phrases: strings only, or null when the backend sent none (an older backend). */
export const readHoldPhrases = (value: unknown): string[] | null =>
  Array.isArray(value)
    ? value.filter((phrase): phrase is string => typeof phrase === 'string' && phrase.trim() !== '')
    : null;

const GENERIC_VALIDATION = 'Validation error';

/**
 * The sentence the server wrote when it refused a list ("A restricted topic is listed twice."),
 * as it is — the field path after it would only name the setting the admin is looking at. Null
 * for any other failure (the caller's usual wording then).
 */
export const restrictedTopicsRefusal = (err: unknown): string | null => {
  const body = getErrorBody(err);
  const sentence = typeof body?.error === 'string' ? body.error.trim() : '';
  const fields = Array.isArray(body?.fields) ? body.fields : [];
  const aboutTopics = fields.some(
    (field) =>
      typeof field === 'string' &&
      // `restrictedTopics`, `departmentSettings.7.restrictedTopics`, `restrictedTopicsChange.add`
      field.split('.').some((part) => part.startsWith('restrictedTopics'))
  );
  return body?.code === 'VALIDATION_FAILED' &&
    aboutTopics &&
    sentence &&
    sentence !== GENERIC_VALIDATION
    ? sentence
    : null;
};

/**
 * A chip's remove control: the 12 px icon keeps its size, the area that takes the press is 24 px
 * (the icon plus 6 px on every side, an invisible layer — nothing in the chip moves).
 */
export const TOPIC_REMOVE_HIT_AREA =
  "relative before:absolute before:-inset-1.5 before:content-['']";
