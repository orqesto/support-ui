import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GitBranch, RefreshCw, ArrowRight, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { useDepartments } from '@/hooks/useDepartments';
import { apiClient } from '@/lib/api-client';
import { messageService } from '@/services/message.service';
import { formatDate } from '@/lib/utils';
import type { Message } from '@/types';
import { logger } from '@/lib/logger';

const PAGE_SIZE = 50;

export const NeedsRoutingPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: departments = [] } = useDepartments();

  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routingId, setRoutingId] = useState<number | null>(null);
  const [selectedDept, setSelectedDept] = useState<Record<number, number>>({});
  const [routeError, setRouteError] = useState<string | null>(null);

  const activeDepts = departments.filter((dept) => dept.active);

  const load = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        view: 'needs_routing',
        page: pageNum.toString(),
        limit: PAGE_SIZE.toString(),
      });
      const response = await apiClient.get<{
        success: boolean;
        data: Message[];
        pagination: { total: number };
      }>(`/api/messages?${params.toString()}`);
      setMessages(response.data.data);
      setTotal(response.data.pagination?.total ?? response.data.data.length);
    } catch (err) {
      logger.error('Failed to load needs_routing queue:', err);
      setError('Failed to load the routing queue. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const handleRoute = async (id: number) => {
    const deptId = selectedDept[id];
    if (!deptId) return;
    setRoutingId(id);
    setRouteError(null);
    try {
      await messageService.manualRoute(id, deptId);
      // Refresh the sidebar count badge so it doesn't lag behind by up to 60s
      void queryClient.invalidateQueries({ queryKey: ['needs-routing-count'] });
      // Drop the row optimistically; if it was the last row on a page > 1,
      // step back so the user doesn't sit on an empty page.
      const remaining = messages.filter((msg) => msg.id !== id);
      const nextTotal = Math.max(total - 1, 0);
      // Drop the routed message's picker selection so the state map doesn't
      // accumulate entries for messages no longer in the list.
      setSelectedDept((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (remaining.length === 0 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        setMessages(remaining);
        setTotal(nextTotal);
        // If we have remaining capacity AND there were more rows beyond this page,
        // refresh to pull in the next item so the table doesn't visibly shrink.
        if (remaining.length < PAGE_SIZE && nextTotal > remaining.length + (page - 1) * PAGE_SIZE) {
          void load(page);
        }
      }
    } catch (err) {
      logger.error('Failed to manually route message:', err);
      setRouteError('Failed to route the message. Please try again.');
    } finally {
      setRoutingId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitBranch className="w-6 h-6" />
              Needs Routing
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Messages the routing engine couldn't assign to a department
            </p>
          </div>
          <Button variant="outline" onClick={() => void load(page)} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {routeError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-destructive border border-destructive/30 bg-destructive/10">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {routeError}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-destructive border border-destructive/30 bg-destructive/10">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading routing queue...
            </CardContent>
          </Card>
        ) : messages.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <GitBranch className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground font-medium">No messages need routing</p>
              <p className="text-sm text-muted-foreground mt-1">
                All incoming messages have been assigned to a department
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{total} message{total === 1 ? '' : 's'} awaiting assignment</p>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto rounded-lg border">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-left text-muted-foreground">
                      Sender
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-left text-muted-foreground">
                      Subject
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-left text-muted-foreground">
                      Received
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-left text-muted-foreground">
                      Route to
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-right text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-background divide-border">
                  {messages.map((msg) => (
                    <tr key={msg.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium truncate max-w-[200px]">{msg.sender}</p>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/messages/${msg.id}`)}
                          className="text-sm text-left truncate max-w-[300px] hover:underline text-foreground"
                        >
                          {msg.subject ?? '(no subject)'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(msg.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={selectedDept[msg.id] ?? ''}
                          onChange={(ev) =>
                            setSelectedDept((prev) => ({
                              ...prev,
                              [msg.id]: Number(ev.target.value),
                            }))
                          }
                          className="text-sm rounded border bg-input text-foreground border-border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">Select department…</option>
                          {activeDepts.map((dept) => (
                            <option key={dept.id} value={dept.id}>
                              {dept.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          onClick={() => void handleRoute(msg.id)}
                          disabled={!selectedDept[msg.id] || routingId === msg.id}
                        >
                          {routingId === msg.id ? 'Routing…' : (
                            <>
                              <ArrowRight className="w-3.5 h-3.5 mr-1" />
                              Route
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
                <Card key={msg.id}>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium">{msg.sender}</p>
                      <button
                        type="button"
                        onClick={() => navigate(`/messages/${msg.id}`)}
                        className="text-sm text-left text-muted-foreground hover:underline truncate w-full"
                      >
                        {msg.subject ?? '(no subject)'}
                      </button>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(msg.createdAt)}</p>
                    </div>
                    <div className="flex gap-2 items-end">
                      <select
                        value={selectedDept[msg.id] ?? ''}
                        onChange={(ev) =>
                          setSelectedDept((prev) => ({
                            ...prev,
                            [msg.id]: Number(ev.target.value),
                          }))
                        }
                        className="flex-1 text-sm rounded border bg-input text-foreground border-border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select department…</option>
                        {activeDepts.map((dept) => (
                          <option key={dept.id} value={dept.id}>
                            {dept.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() => void handleRoute(msg.id)}
                        disabled={!selectedDept[msg.id] || routingId === msg.id}
                      >
                        {routingId === msg.id ? '…' : <ArrowRight className="w-4 h-4" />}
                      </Button>
                    </div>
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
