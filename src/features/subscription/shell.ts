/**
 * The light public entry of this feature for the app shell (App and its route helpers, the
 * layout, the processing indicator): code that every page loads first. It re-exports leaf files
 * only and never `./index`, so importing it does not pull the whole feature into the main bundle.
 * Everything else imports `@/features/subscription` (the index). CI: `npm run check:shell`.
 */
export { AiPausedBanner } from './components/AiPausedBanner';
export { AiUnavailableNotice } from './components/AiUnavailableNotice';
export { PAST_DUE_AGENT_TEXT, PAST_DUE_TEXT } from './components/cancelCopy';
export { KbPausedBanner } from './components/KbPausedBanner';
export { SubscriptionGateOverlay } from './components/SubscriptionGateOverlay';
export { fmtMoney } from './components/budget.rules';
