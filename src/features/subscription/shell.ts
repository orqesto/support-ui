/**
 * The light public entry of this feature: leaf files only, never `./index`. Use it from the app
 * shell (App and its route helpers, the layout, the processing indicator: code every page loads
 * first; CI `npm run check:shell`) and from any other feature that needs a small non-UI piece
 * (a hook, constant or helper). Importing the index instead loads the whole feature, in the
 * page's bundle and in every test that renders the importer. UI comes from `@/features/subscription`.
 */
export { AiPausedBanner } from './components/AiPausedBanner';
export { AiUnavailableNotice } from './components/AiUnavailableNotice';
export { PAST_DUE_AGENT_TEXT, PAST_DUE_TEXT } from './components/cancelCopy';
export { KbPausedBanner } from './components/KbPausedBanner';
export { SubscriptionGateOverlay } from './components/SubscriptionGateOverlay';
export { fmtMoney } from './components/budget.rules';
export { useAiRefusalText, useIsWorkspaceAdmin } from './components/useAiRefusalText';
