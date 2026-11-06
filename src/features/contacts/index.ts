/**
 * The contacts feature (contact profile drawer, contact facts, notes). This file is its only public
 * entry: code outside `src/features/contacts/` imports from `@/features/contacts`, never a deep path
 * (ESLint `boundaries/api-only-features`). Export only what pages or other features use.
 */
export { ContactAvatar } from './components/ContactAvatar';
export { ContactFactRows } from './components/ContactFactRows';
export { CONTACT_NOTES_CHANGED, ContactNotesIndicator } from './components/ContactNotesIndicator';
export { ContactProfileActivity } from './components/ContactProfileActivity';
export { ContactProfileDetails } from './components/ContactProfileDetails';
export { ContactProfilePanel } from './components/ContactProfilePanel';
export { customerSince, lifetimeLabel } from './components/contactFacts';
export { useContactProfile } from './hooks/useContactProfile';
export { useCustomerNotesMark } from './hooks/useCustomerNoteSummary';
