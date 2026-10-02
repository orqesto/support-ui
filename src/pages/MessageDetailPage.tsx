import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { MessageDetail } from '@/components/messages/MessageDetail';
import { Button } from '@/components/ui/Button';
import { messageService } from '@/services/message.service';
import type { Message } from '@/types';
import { logger } from '@/lib/logger';
import { useIsPhone } from '@/components/messages/useIsPhone';
import { DeleteMessageDialog } from '@/components/messages/DeleteMessageDialog';
import { useMessagesStore } from '@/stores/messagesStore';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import { usePermissions } from '@/hooks/usePermissions';
import { similarResultsCache } from '@/components/messages/AiTabPanel';
import { Permission } from '@/types/roles';
import { formatConvId } from '@/lib/messageHelpers';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';

export const MessageDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  // The open detail registers its prompt-aware close here so the Back button asks
  // "Mark as read?" for an unread triage thread, matching the slide-over.
  const requestCloseRef = useRef<(() => void) | null>(null);
  // v4 mobile: on a phone the detail's own sticky header row carries Back (same prompt-aware
  // close as this bar), so the bar is not rendered there.
  const isPhone = useIsPhone();
  /*
    More → Delete message asks the slide-over's question (the shared dialog), deletes, and goes
    back to the inbox. Shown only to a viewer the backend lets delete (DELETE /api/messages/:id takes
    DELETE_MESSAGES or MANAGE_ORGANIZATION) — the same gate as the slide-over.

    ⛔ The in-flight flag lives HERE, not in a component mounted with the dialog: the dialog
    refuses every close path while a delete runs, and a flag that unmounted with it would let a
    second DELETE go out.
  */
  const { hasPermission } = usePermissions();
  const canDelete =
    hasPermission(Permission.DELETE_MESSAGES) || hasPermission(Permission.MANAGE_ORGANIZATION);
  const queryClient = useQueryClient();
  const clearListCache = useMessagesStore((state) => state.clearCache);
  const orgCode = useCurrentOrgCode();
  const [deleteOpen, setDeleteOpen] = useState(false);
  // The MESSAGES whose delete is in flight, keyed on message id — not a page-wide flag (after
  // history Back to another message, that message's confirm must not show the first one's
  // spinner or refuse to close) and not a single slot (42 hangs → 43 hangs → Back to 42: 42's
  // confirm must still be busy, and a second DELETE /42 must not go out). Each request removes
  // only its own id when it settles.
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<number>>(() => new Set());
  const deletingIdsRef = useRef<Set<number>>(new Set());
  // The page that asked: a success that lands after the agent left (browser Back) must not
  // navigate them away from wherever they went. Keyed on the ROUTE id, not the loaded message:
  // after history Back to another message the old message stays in state until the new read
  // lands, so `message.id` would still match the one being deleted.
  const mountedRef = useRef(true);
  const routeIdRef = useRef(id);
  routeIdRef.current = id;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // `id` may be either a numeric conv id ('16952') or a publicId ('SUP-42').
    // Pass the raw string straight through — the BE's resolveConvIdFromParam
    // dual-resolves both shapes. Previously this used parseInt and silently
    // dropped any non-numeric (i.e. publicId-shaped) URL.
    if (id) {
      void fetchMessage(id, true);
    }
    // Another message (history Back/Forward keeps this page mounted): its confirm is not open.
    setDeleteOpen(false);
  }, [id]);

  const handleApprove = useCallback(() => {
    if (message) navigate(`/tickets/create?messageId=${message.id}`);
  }, [message, navigate]);

  /**
   * Reclassify a filtered message — "this isn't junk, put it back".
   *
   * MessageDetail gates the whole filtered action block on `isFiltered &&
   * onClassify`, so omitting this prop did not disable one button: it removed
   * Approve and Move to Spam from the page entirely. The inbox slide-over passed
   * it and the full page did not, so the same message offered different actions
   * depending on how it was opened — and the Orphaned Outbound list links HERE,
   * which left an orphan with no way out of the orphan lens at all.
   *
   * `onApprove` above is a different thing despite the name: it starts a ticket.
   */
  const handleClassify = useCallback(
    async (
      action: 'approve' | 'mark_suspicious' | 'move_to_spam' | 'confirm_spam',
      createDetectionRule?: boolean,
      trainSpamFilter?: boolean,
      confirm?: boolean
    ) => {
      if (!message) return;
      await messageService.classify(
        message.id,
        action,
        createDetectionRule,
        trainSpamFilter,
        confirm
      );
      // Re-read rather than patch locally: approve moves the status server-side
      // (filtered → new) and the action strip renders off that status, so a stale
      // copy would keep offering the action that has already been taken.
      await fetchMessage(message.id);
    },
    [message]
  );

  const fetchMessage = async (messageId: number | string, fullLoad = false) => {
    try {
      if (fullLoad) setLoading(true);
      const response = await messageService.getById(messageId);
      if (response.success && response.data) {
        setMessage(response.data);
      }
    } catch (error) {
      logger.error('Failed to fetch message:', error);
    } finally {
      if (fullLoad) setLoading(false);
    }
  };

  const goBack = useCallback(() => {
    navigate('/messages');
  }, [navigate]);

  const confirmDelete = async (target: Message) => {
    const askedFromRoute = routeIdRef.current ?? null;
    if (deletingIdsRef.current.has(target.id)) return;
    deletingIdsRef.current.add(target.id);
    setDeletingIds(new Set(deletingIdsRef.current));
    try {
      await messageService.delete(target.id);
    } catch (error) {
      logger.error('Failed to delete message:', error);
      // Stay on the page with the dialog up: the reason says whether a retry can work. Moved on
      // to another message meanwhile: name the one that failed, or it reads as this one's.
      const reason = getApiErrorMessage(error) ?? 'Failed to delete message';
      toast.error(
        routeIdRef.current === askedFromRoute
          ? reason
          : `${formatConvId(target, orgCode)} was not deleted: ${reason}`
      );
      return;
    } finally {
      deletingIdsRef.current.delete(target.id);
      if (mountedRef.current) setDeletingIds(new Set(deletingIdsRef.current));
    }
    /*
      What the slide-over does after a delete, so the inbox we land on cannot list the deleted
      thread from its page cache, nor count it in the routing badge.
    */
    clearListCache();
    void queryClient.invalidateQueries({ queryKey: ['needs-routing-count'] });
    similarResultsCache.delete(target.id);
    // Gone from this page, or moved on to another message while it ran: nothing to leave.
    if (!mountedRef.current || routeIdRef.current !== askedFromRoute) return;
    setDeleteOpen(false);
    goBack();
  };

  // Route Back through the detail's prompt-aware close (falls back to a direct
  // navigate if it hasn't registered yet, e.g. the not-found state).
  const handleBack = useCallback(() => {
    if (requestCloseRef.current) {
      requestCloseRef.current();
      return;
    }
    goBack();
  }, [goBack]);

  if (loading) {
    return (
      <Layout>
        <div className="flex gap-2 justify-center items-center h-64 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading message...
        </div>
      </Layout>
    );
  }

  if (!message) {
    return (
      <Layout>
        <div className="flex flex-col gap-4 justify-center items-center h-64">
          <div className="text-muted-foreground">Message not found</div>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back to Messages
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Phones: the DOCUMENT scrolls, so below 640px nothing on the way
          down to the detail clips — `overflow-hidden` here would also stop the detail's sticky
          rows from sticking to the screen. The negative margins undo the shell's 8px padding
          (Layout `p-2 pt-16`), so the detail runs edge to edge and starts under the app header. */}
      <div className="flex overflow-hidden flex-col flex-1 min-h-0 max-sm:block max-sm:overflow-visible max-sm:-mx-2 max-sm:-mt-2 max-sm:-mb-2">
        {/* Back bar */}
        {!isPhone && (
          <div className="flex-shrink-0 border-b border-border">
            {/* No left padding: Back lines up with the title and content below it. */}
            <div className="flex gap-2 items-center py-2 pr-4 w-full">
              <Button onClick={handleBack} variant="outline" size="sm">
                <ArrowLeft className="mr-2 w-4 h-4" />
                Back
              </Button>
              <h1 className="font-display text-base font-semibold">Message Details</h1>
            </div>
          </div>
        )}

        {/* 3-zone panel */}
        <div className="flex overflow-hidden flex-1 justify-center min-h-0 max-sm:block max-sm:overflow-visible">
          {/* v4: the full page is capped at 1640px and centred; past that the two columns would
              only spread the thread and sidebar further apart. */}
          <div
            data-testid="detail-page-frame"
            className="flex flex-col w-full max-w-[1640px] h-full border-x border-border max-sm:block max-sm:h-auto max-sm:border-x-0"
          >
            <MessageDetail
              key={message.id}
              message={message}
              isFullPage
              onClose={goBack}
              onRegisterRequestClose={(fn) => {
                requestCloseRef.current = fn;
              }}
              onReadChanged={() => fetchMessage(message.id)}
              onRefresh={() => fetchMessage(message.id)}
              onApprove={handleApprove}
              onClassify={handleClassify}
              onReject={() => fetchMessage(message.id)}
              onReopen={() => fetchMessage(message.id)}
              onDelete={canDelete ? () => setDeleteOpen(true) : undefined}
              onResolve={() => fetchMessage(message.id)}
            />
          </div>
        </div>
      </div>
      <DeleteMessageDialog
        open={deleteOpen}
        message={message}
        deleting={deletingIds.has(message.id)}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete(message)}
      />
    </Layout>
  );
};
