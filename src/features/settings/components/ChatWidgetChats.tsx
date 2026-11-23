import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import {
  chatWidgetService,
  type ChatWidget,
  type ChatWidgetSession,
  type ChatWidgetSessionsPage,
  type ChatWidgetTranscript,
} from '@/features/settings/services/chatWidget.service';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { formatDate } from '@/lib/utils';
import { WEBSITE_VISITOR_NO_EMAIL, isNoEmailVisitor } from '@/lib/visitorEmail';

const PAGE_SIZE = 25;

/** Who the visitor is, as far as the chat knows: a name, an address, or neither. */
const visitorLine = (session: ChatWidgetSession): string => {
  const email =
    session.visitorEmail && !isNoEmailVisitor(session.visitorEmail) ? session.visitorEmail : null;
  if (session.visitorName && email) return `${session.visitorName} · ${email}`;
  if (email) return email;
  return session.visitorName ? `${session.visitorName} (no email)` : WEBSITE_VISITOR_NO_EMAIL;
};

const AUTHOR: Record<ChatWidgetTranscript['messages'][number]['author'], string> = {
  visitor: 'Visitor',
  bot: 'Bot — AI-written',
  notice: 'Widget — fixed line',
};

const SessionFacts = ({ session }: { session: ChatWidgetSession }) => (
  <span className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
    <span>{formatDate(session.lastMessageAt ?? session.startedAt)}</span>
    <span>
      · {session.messageCount} {session.messageCount === 1 ? 'message' : 'messages'}
    </span>
    <Badge variant={session.botAnswered ? 'default' : 'secondary'}>
      {session.botAnswered ? 'Bot answered' : 'No bot answer'}
    </Badge>
    {session.conversationId === null && <span>· not in the inbox</span>}
  </span>
);

/**
 * A widget's chats, read-only: the list (newest activity first, a page at a time) and one chat's
 * transcript. A chat the bot answered and never handed over exists nowhere else in the app, so
 * this is where "what did the bot tell this visitor" is answered.
 */
export function ChatWidgetChats({
  widget,
  initialSessionId = null,
  onClose,
}: {
  /** null = closed. */
  widget: ChatWidget | null;
  /** Open straight on this chat (a link from an audit row). */
  initialSessionId?: number | null;
  onClose: () => void;
}) {
  const widgetId = widget?.id;
  const [page, setPage] = useState(1);
  const [list, setList] = useState<{
    sessions: ChatWidgetSession[];
    pagination: ChatWidgetSessionsPage;
  } | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<ChatWidgetTranscript | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped by "Try again" after a failed read (the list's, or the open chat's). */
  const [attempt, setAttempt] = useState(0);

  // Another widget (or a reopening) starts from its first page — with nothing open, unless a
  // link asked for one chat.
  useEffect(() => {
    setPage(1);
    setList(null);
    setOpenId(initialSessionId);
    setTranscript(null);
    setError(null);
  }, [widgetId, initialSessionId]);

  useEffect(() => {
    if (widgetId === undefined) return;
    let stale = false;
    setList(null);
    setError(null);
    chatWidgetService.getSessions(widgetId, page, PAGE_SIZE).then(
      (read) => {
        if (!stale) setList(read);
      },
      (err: unknown) => {
        if (stale) return;
        logger.error('Failed to load widget chats:', err);
        setError(getApiErrorMessage(err) ?? 'The chats could not be loaded.');
      }
    );
    return () => {
      stale = true;
    };
  }, [widgetId, page, attempt]);

  useEffect(() => {
    if (widgetId === undefined || openId === null) return;
    let stale = false;
    setTranscript(null);
    setError(null);
    chatWidgetService.getSession(widgetId, openId).then(
      (read) => {
        if (!stale) setTranscript(read);
      },
      (err: unknown) => {
        if (stale) return;
        logger.error('Failed to load a widget chat:', err);
        setError(getApiErrorMessage(err) ?? 'The chat could not be loaded.');
      }
    );
    return () => {
      stale = true;
    };
  }, [widgetId, openId, attempt]);

  if (!widget) return null;
  const totalPages = list?.pagination.totalPages ?? 1;
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chats — {widget.name}</DialogTitle>
        </DialogHeader>
        {error && (
          <div role="alert" className="flex flex-wrap gap-2 items-center text-sm text-destructive">
            <span>{error}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAttempt((count) => count + 1)}
            >
              Try again
            </Button>
          </div>
        )}

        {openId === null ? (
          <div className="space-y-3">
            {!list && !error && (
              <p role="status" className="text-sm text-muted-foreground">
                Loading chats…
              </p>
            )}
            {list?.sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">No visitor has used this widget yet.</p>
            )}
            {list && list.sessions.length > 0 && (
              <ul aria-label="Chats of this widget" className="divide-y max-h-[55vh] overflow-auto">
                {list.sessions.map((session) => (
                  <li key={session.id} className="flex gap-3 justify-between items-center py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex flex-col flex-1 gap-0.5 items-start p-1 h-auto min-w-0 text-left"
                      onClick={() => setOpenId(session.id)}
                      aria-label={`Open the chat with ${visitorLine(session)}`}
                    >
                      <span className="text-sm font-medium truncate max-w-full">
                        {visitorLine(session)}
                      </span>
                      <SessionFacts session={session} />
                    </Button>
                    {session.conversationId !== null && (
                      <Link
                        to={`/threads/${session.conversationId}`}
                        className="text-xs text-primary hover:underline shrink-0"
                      >
                        Open thread
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {list && totalPages > 1 && (
              <div className="flex gap-2 justify-between items-center">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} · {list.pagination.total} chats
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 px-2"
              onClick={() => {
                setOpenId(null);
                setTranscript(null);
                // A chat that could not be loaded is not the list's problem.
                setError(null);
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              All chats
            </Button>
            {!transcript && !error && (
              <p role="status" className="text-sm text-muted-foreground">
                Loading the chat…
              </p>
            )}
            {transcript && (
              <>
                <div className="flex flex-wrap gap-3 justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">{visitorLine(transcript.session)}</p>
                    <SessionFacts session={transcript.session} />
                  </div>
                  {transcript.session.conversationId !== null && (
                    <Link
                      to={`/threads/${transcript.session.conversationId}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Open thread
                    </Link>
                  )}
                </div>
                <ol
                  aria-label="What was said in this chat"
                  className="space-y-2 max-h-[50vh] overflow-auto"
                >
                  {transcript.messages.map((message) => (
                    <li
                      key={message.id}
                      className={`p-2 rounded-md border text-sm ${message.author === 'visitor' ? 'bg-background' : 'bg-muted/40'}`}
                    >
                      <p className="mb-1 text-[11px] text-muted-foreground">
                        {AUTHOR[message.author] ?? 'Widget'}
                        {message.author === 'bot' && message.confidence !== null
                          ? ` · confidence ${Math.round(message.confidence)}%`
                          : ''}
                        {' · '}
                        {formatDate(message.createdAt)}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </li>
                  ))}
                </ol>
                {transcript.truncated && (
                  <p className="text-xs text-muted-foreground">
                    This chat is longer: only its first 500 messages are shown.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
