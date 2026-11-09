/**
 * The light public entry of this feature: leaf files only, never `./index`. Use it from the app
 * shell (App and its route helpers, the layout, the processing indicator: code every page loads
 * first; CI `npm run check:shell`) and from any other feature that needs a small non-UI piece
 * (a hook, constant, helper, service or type, or a tiny leaf component such as a chip or icon).
 * Importing the index instead loads the whole
 * feature, in the page's bundle and in every test that renders the importer. UI comes from
 * `@/features/tickets`.
 */
export { useTicketsStore } from './stores/ticketsStore';
export { TicketRef } from './components/TicketRef';
export { PriorityIcon } from './components/list/ticketRowBits';
export { categoryService } from './services/category.service';
export { threadRowMessage } from './services/threadCandidates.service';
export { fetchTicketViewCounts, ticketService } from './services/ticket.service';
export {
  ticketThreadsService,
  type ThreadTicket,
  type TicketThread,
} from './services/ticketThreads.service';
export { THREAD_TICKETS_CHANGED } from './services/ticketThreadsEvents';
