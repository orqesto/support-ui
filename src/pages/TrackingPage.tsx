// Public conversation tracking page (#20). Anonymous viewer access via the
// link they get in the per-source acknowledgment email. URL pattern:
//   /track/:orgSlug/:deptSlug/:conversationId?t=<token>
//
// orgSlug/deptSlug/conversationId in the path are cosmetic — the BE only
// validates the token query param. We still surface them in the URL so the
// link self-describes and looks trustworthy in email previews.

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

type TrackingPayload = {
  organization: { name: string | null };
  department: { name: string | null };
  conversation: {
    id: number;
    subject: string | null;
    status: string;
    priority: string;
    createdAt: string;
    lastReplyAt: string | null;
    resolvedAt: string | null;
    closedAt: string | null;
  };
  events: Array<{
    id: number;
    direction: 'customer' | 'agent';
    isAutomated: boolean;
    content: string;
    sentAt: string;
  }>;
};

// Status → human label + tone. Keep this server-state aligned with conversationStatusEnum.
const STATUS_LABELS: Record<string, { label: string; tone: 'open' | 'progress' | 'closed' }> = {
  new: { label: 'Received', tone: 'open' },
  open: { label: 'Open', tone: 'open' },
  pending: { label: 'Pending', tone: 'progress' },
  awaiting_response: { label: 'Awaiting your reply', tone: 'progress' },
  client_replied: { label: 'You replied', tone: 'progress' },
  needs_routing: { label: 'Being routed', tone: 'progress' },
  in_progress: { label: 'In progress', tone: 'progress' },
  resolved: { label: 'Resolved', tone: 'closed' },
  closed: { label: 'Closed', tone: 'closed' },
  filtered: { label: 'Filtered', tone: 'closed' },
};

const fmtTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
};

export const TrackingPage = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t');

  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; data: TrackingPayload }
  >({ kind: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ kind: 'error', message: 'This link is missing its token.' });
      return;
    }
    let cancelled = false;
    apiClient
      .get<{ success: boolean; data: TrackingPayload; error?: string }>(
        `/api/track/${encodeURIComponent(token)}`
      )
      .then((response) => {
        if (cancelled) return;
        if (response.data.success && response.data.data) {
          setState({ kind: 'ok', data: response.data.data });
        } else {
          setState({ kind: 'error', message: response.data.error ?? 'Not found' });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logger.warn('[TrackingPage] fetch failed', err);
        // Avoid leaking server internals; treat anything non-2xx as not-found.
        setState({
          kind: 'error',
          message:
            'This tracking link is invalid or has expired. Please reply to your original email if you still need help.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token, conversationId]);

  if (state.kind === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="flex justify-center items-center px-4 min-h-screen bg-gray-50">
        <div className="w-full max-w-md p-6 text-center bg-white rounded-lg shadow-sm">
          <h1 className="text-lg font-medium text-foreground">Tracking link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        </div>
      </div>
    );
  }

  const { organization, department, conversation, events } = state.data;
  const status = STATUS_LABELS[conversation.status] ?? {
    label: conversation.status,
    tone: 'progress' as const,
  };

  const toneClass =
    status.tone === 'closed'
      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
      : status.tone === 'open'
        ? 'bg-blue-50 text-blue-800 ring-blue-200'
        : 'bg-amber-50 text-amber-800 ring-amber-200';

  return (
    <div className="min-h-screen px-4 py-10 bg-gray-50">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          {organization.name && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {organization.name}
              {department.name ? ` · ${department.name}` : null}
            </p>
          )}
          <h1 className="text-xl font-semibold text-foreground">
            {conversation.subject ?? 'Your request'}
          </h1>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${toneClass}`}
            >
              {status.label}
            </span>
            <span className="text-muted-foreground">
              Opened {fmtTime(conversation.createdAt)}
            </span>
          </div>
        </header>

        <section className="space-y-3">
          {events.length === 0 ? (
            <p className="p-4 text-sm text-center text-muted-foreground bg-white rounded-md">
              No messages yet.
            </p>
          ) : (
            events.map((event) => (
              <article
                key={event.id}
                className={`p-4 rounded-md ${
                  event.direction === 'customer'
                    ? 'bg-white border border-gray-200'
                    : 'bg-blue-50 border border-blue-100'
                }`}
              >
                <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
                  <span className="font-medium">
                    {event.direction === 'customer'
                      ? 'You'
                      : event.isAutomated
                        ? 'Auto-reply'
                        : 'Support'}
                  </span>
                  <span>{fmtTime(event.sentAt)}</span>
                </div>
                {/* BE returned content has already been run through sanitizeHtml
                    server-side; rendering as HTML is safe within that contract. */}
                <div
                  className="text-sm text-foreground prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: event.content }}
                />
              </article>
            ))
          )}
        </section>

        {conversation.resolvedAt && (
          <p className="text-xs text-center text-muted-foreground">
            Resolved {fmtTime(conversation.resolvedAt)}
          </p>
        )}
      </div>
    </div>
  );
};
