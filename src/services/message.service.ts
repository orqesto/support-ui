/**
 * The messages API client. The endpoints live by domain in `./message/` (lists and reads, reply
 * and compose, AI and knowledge base, thread actions); `messageService` is assembled HERE, key
 * for key in its original order, because tests `vi.mock` this path and every caller imports it.
 * Keep it a plain object of own properties (tests `vi.spyOn(messageService, ...)`), and never
 * import this file from `./message/` (that would be a cycle and would route around the mock).
 */
import { messageActionsApi } from './message/messageActions.api';
import { messageAiApi } from './message/messageAi.api';
import { messageComposeApi } from './message/messageCompose.api';
import { messageListsApi } from './message/messageLists.api';

export type {
  ReceivedAddressRow,
  AddressCoverage,
  SenderCandidate,
  ReceivedAddresses,
  MessageSourceOption,
  MessageActivityEntry,
  MessageNote,
  PaginationMeta,
  PaginatedResponse,
  ContactsResponse,
  ListScope,
  SearchReading,
  SearchMatch,
  ThreadsResponse,
  ThreadBoardAnswer,
  MessagesMetadata,
  MetadataResponse,
  MessageContact,
  MessageContactSubject,
  ReplyAssignIntent,
  ReplyRecipients,
  MessageThread,
  AiDraft,
  WhatsAppTemplateSend,
  KbQaPairInput,
} from './message/message.types';

export { exactTotal, formatTotal } from '@/lib/listTotals';

export {
  ListTimedOutError,
  normalizeSearchMatch,
  normalizeSearchReading,
} from './message/threadsReading';

export const messageService = {
  getMetadata: messageListsApi.getMetadata,
  getThreads: messageListsApi.getThreads,
  getThreadBoard: messageListsApi.getThreadBoard,
  getAll: messageListsApi.getAll,
  getById: messageListsApi.getById,
  markAsProcessed: messageActionsApi.markAsProcessed,
  markAsNotCustomerWork: messageActionsApi.markAsNotCustomerWork,
  markAsUnprocessed: messageActionsApi.markAsUnprocessed,
  delete: messageActionsApi.delete,
  reply: messageComposeApi.reply,
  listWhatsAppTemplates: messageComposeApi.listWhatsAppTemplates,
  replyWithAttachments: messageComposeApi.replyWithAttachments,
  getReceivedAtOptions: messageComposeApi.getReceivedAtOptions,
  getReceivedAddresses: messageComposeApi.getReceivedAddresses,
  composeNew: messageComposeApi.composeNew,
  resolve: messageActionsApi.resolve,
  reopen: messageActionsApi.reopen,
  classify: messageActionsApi.classify,
  getThreadMessages: messageListsApi.getThreadMessages,
  getThreadMessagesAfter: messageListsApi.getThreadMessagesAfter,
  getLinkedTicket: messageListsApi.getLinkedTicket,
  getSimilarResolvedMessages: messageAiApi.getSimilarResolvedMessages,
  getSuggestedAnswer: messageAiApi.getSuggestedAnswer,
  composeReply: messageAiApi.composeReply,
  getComposeSources: messageAiApi.getComposeSources,
  composePolish: messageAiApi.composePolish,
  reanalyze: messageAiApi.reanalyze,
  saveSuggestedAnswer: messageAiApi.saveSuggestedAnswer,
  getKBReferences: messageAiApi.getKBReferences,
  getActivity: messageActionsApi.getActivity,
  getNotes: messageActionsApi.getNotes,
  addNote: messageActionsApi.addNote,
  updateNote: messageActionsApi.updateNote,
  deleteNote: messageActionsApi.deleteNote,
  clearHoldNoteReason: messageActionsApi.clearHoldNoteReason,
  setStatus: messageActionsApi.setStatus,
  setPriority: messageActionsApi.setPriority,
  setCategory: messageActionsApi.setCategory,
  close: messageActionsApi.close,
  setThreadMute: messageActionsApi.setThreadMute,
  markRead: messageActionsApi.markRead,
  markUnread: messageActionsApi.markUnread,
  markAsLead: messageActionsApi.markAsLead,
  updateLeadState: messageActionsApi.updateLeadState,
  checkContradiction: messageAiApi.checkContradiction,
  dismissContradiction: messageAiApi.dismissContradiction,
  getContacts: messageListsApi.getContacts,
  getContactSubjects: messageListsApi.getContactSubjects,
  getNeedsRoutingCount: messageListsApi.getNeedsRoutingCount,
  getMessageSourcesForFilter: messageListsApi.getMessageSourcesForFilter,
  manualRoute: messageActionsApi.manualRoute,
};
