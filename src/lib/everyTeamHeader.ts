/**
 * Set on ONE request to keep the team selected in the header from filtering it: the request
 * interceptor (api-client `applyRequestContext`) then sends no `X-Department-Context` and removes
 * this marker, so it never leaves the browser. For a read that must describe the whole workspace —
 * the mailboxes automatic replies will send from.
 */
export const EVERY_TEAM_HEADER = 'X-Every-Team';
