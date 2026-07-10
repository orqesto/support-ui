import { useCallback, useEffect, useState } from 'react';
import { MailWarning, RefreshCw, AlertCircle, Info, Search, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import type { Message } from '@/types';
import { logger } from '@/lib/logger';

const PAGE_SIZE = 50;

/**
 * Admin-only diagnostic: orphaned outbound messages — our own sent mail that the
 * sent-folder importer couldn't thread to any inbound parent. They're hidden from
 * every agent queue (one-sided outbound, not customer requests) and self-heal into
 * real threads if the parent inbound is ever ingested. This is a data-health view,
 * NOT a work queue — hence read-only (open-thread only, no triage actions).
 */
export const OrphanedOutboundPage = () => {
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const offset = (pageNum - 1) * PAGE_SIZE;
      const response = await apiClient.get<{
        success: boolean;
        data: Message[];
        pagination: { total: number };
      }>(`/api/messages/orphaned?limit=${PAGE_SIZE}&offset=${offset}`);
      setMessages(response.data.data);
      setTotal(response.data.pagination?.total ?? response.data.data.length);
    } catch (err) {
      logger.error('Failed to load orphaned outbound:', err);
      setError('Failed to load orphaned outbound messages. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  // Re-run parent matching for one orphan. On a hit it's merged into the real
  // thread and drops off this list; otherwise we surface a "not found yet" note.
  const handleReprocess = async (id: number) => {
    setReprocessingId(id);
    setActionMsg(null);
    setError(null);
    try {
      const response = await apiClient.post<{
        success: boolean;
        matched: boolean;
        parentPublicId?: string;
      }>(`/api/messages/${id}/reprocess-orphan`);
      if (response.data.matched) {
        setMessages((prev) => prev.filter((msg) => msg.id !== id));
        setTotal((prev) => Math.max(prev - 1, 0));
        setActionMsg(
          `Matched and merged into thread ${response.data.parentPublicId ?? ''}`.trim() + '.'
        );
      } else {
        setActionMsg('No matching parent thread found yet — try again after more mail syncs.');
      }
    } catch (err) {
      logger.error('Failed to reprocess orphaned message:', err);
      setError('Failed to reprocess the message. Please try again.');
    } finally {
      setReprocessingId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MailWarning className="w-6 h-6" />
              Orphaned Outbound
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Sent messages with no matching inbound thread — a data-health diagnostic
            </p>
          </div>
          <Button variant="outline" onClick={() => void load(page)} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="flex items-start gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground border border-border bg-muted/40">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            These are your own outbound emails that couldn&apos;t be threaded to any inbound
            message (e.g. compose-new, or a reply whose original was never ingested). They&apos;re
            hidden from the inbox on purpose. If the matching inbound is ever received, the message
            re-surfaces automatically as a normal conversation — nothing here is deleted.
          </span>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-destructive border border-destructive/30 bg-destructive/10">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {actionMsg && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground border border-border bg-muted/40">
            <Link2 className="w-4 h-4 flex-shrink-0" />
            {actionMsg}
          </div>
        )}

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading orphaned outbound…
            </CardContent>
          </Card>
        ) : messages.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MailWarning className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground font-medium">No orphaned outbound messages</p>
              <p className="text-sm text-muted-foreground mt-1">
                Every sent message is threaded to a conversation
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {total} orphaned message{total === 1 ? '' : 's'}
            </p>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto rounded-lg border">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-left text-muted-foreground">
                      Recipient
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-left text-muted-foreground">
                      Subject
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-left text-muted-foreground">
                      Sent
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-right text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-background divide-border">
                  {messages.map((msg) => (
                    <tr
                      key={msg.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/messages/${msg.id}`)}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium truncate max-w-[240px]">{msg.sender}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-left truncate max-w-[360px] hover:underline text-foreground">
                          {msg.subject ?? '(no subject)'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(msg.createdAt)}
                      </td>
                      <td
                        className="px-4 py-3 text-right whitespace-nowrap"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleReprocess(msg.id)}
                          disabled={reprocessingId === msg.id}
                          title="Search for a matching parent thread"
                        >
                          {reprocessingId === msg.id ? (
                            '…'
                          ) : (
                            <>
                              <Search className="w-3.5 h-3.5 mr-1" />
                              Reprocess
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-3">
              {messages.map((msg) => (
                <Card
                  key={msg.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/messages/${msg.id}`)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium">{msg.sender}</p>
                      <p className="text-sm text-left text-muted-foreground hover:underline truncate w-full">
                        {msg.subject ?? '(no subject)'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(msg.createdAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void handleReprocess(msg.id);
                      }}
                      disabled={reprocessingId === msg.id}
                    >
                      {reprocessingId === msg.id ? (
                        '…'
                      ) : (
                        <>
                          <Search className="w-4 h-4 mr-1" />
                          Reprocess
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center">
                <div className="flex gap-2 items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((prev) => prev - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((prev) => prev + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};
