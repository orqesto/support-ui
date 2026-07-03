/**
 * Ergonomic aliases over the generated OpenAPI component schemas.
 *
 * `generated/api.ts` is produced by `npm run gen:types` from the backend's zod
 * contracts (../BE-service/openapi.json) and is overwritten on every run — do NOT
 * hand-edit it. Add stable, importable names here instead.
 *
 * These are the single source of truth for BE<->FE domain shapes; prefer them over
 * the hand-written types in `@/types` as endpoints are migrated onto the contract.
 */
import type { components } from './generated/api';

/** GET /api/tickets item — includes computed `sender` + `assigneeName`. */
export type TicketListItem = components['schemas']['TicketListItem'];

/** GET /api/tickets/:id — base fields only (NO `sender`/`assigneeName`). */
export type TicketDetail = components['schemas']['TicketDetail'];

// --- Contact ---
export type ContactListItem = components['schemas']['ContactListItem'];
export type ContactProfile = components['schemas']['ContactProfile'];
export type ContactNote = components['schemas']['ContactNote'];
export type ContactLabel = components['schemas']['ContactLabel'];
export type LinkedContact = components['schemas']['LinkedContact'];
export type ContactProfileEntry = components['schemas']['ContactProfileEntry'];
export type ContactStats = components['schemas']['ContactStats'];
export type RecentMessage = components['schemas']['RecentMessage'];
export type RecentTicket = components['schemas']['RecentTicket'];

// --- Organization ---
export type Organization = components['schemas']['Organization'];
export type OrganizationMember = components['schemas']['OrganizationMember'];

// --- Message / conversation ---
export type MessageListItem = components['schemas']['MessageListItem'];
export type MessageDetail = components['schemas']['MessageDetail'];

// --- User ---
export type CurrentUser = components['schemas']['CurrentUser'];

// --- Notification ---
export type Notification = components['schemas']['Notification'];

// --- Attachment (unifies the FE's three prior divergent types) ---
export type Attachment = components['schemas']['Attachment'];

// --- Routing rule ---
export type RoutingRule = components['schemas']['RoutingRule'];

// --- SLA ---
export type SlaBreach = components['schemas']['SlaBreach'];
export type SlaConfigEntry = components['schemas']['SlaConfigEntry'];
