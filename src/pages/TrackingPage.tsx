/* eslint-disable max-lines */
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
    slaResponseMinutes: number | null;
    firstResponseAt: string | null;
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

// Short relative time like "2 minutes ago" / "in 3 hours". Uses
// Intl.RelativeTimeFormat so we get the customer's locale for free.
// Returns null when the timestamp is in the far past so callers can fall
// back to the absolute date.
const RELATIVE_THRESHOLDS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4],
  ['month', 12],
];

const fmtRelative = (iso: string, now: number = Date.now()): string | null => {
  try {
    const target = new Date(iso).getTime();
    if (!Number.isFinite(target)) return null;
    const diffMs = target - now;
    const absSeconds = Math.abs(diffMs) / 1000;
    if (absSeconds < 5) return 'just now';
    const sign = Math.sign(diffMs);
    let amount = absSeconds;
    let unit: Intl.RelativeTimeFormatUnit = 'second';
    for (const [nextUnit, factor] of RELATIVE_THRESHOLDS) {
      if (amount < factor) {
        unit = nextUnit;
        break;
      }
      amount = amount / factor;
      unit = nextUnit;
    }
    if (unit === 'month' && amount >= 12) return null; // > 1 year → absolute
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    return rtf.format(sign * Math.round(amount), unit);
  } catch {
    return null;
  }
};

// Friendly bucket for SLA targets — keep granularity to what a customer
// actually finds useful. The backend stores per-minute resolution, but
// quoting "60 minutes" feels artificial when "within an hour" reads better.
const fmtSLAWindow = (minutes: number): string => {
  if (minutes <= 15) return 'within 15 minutes';
  if (minutes <= 60) return 'within an hour';
  if (minutes <= 4 * 60) return 'within a few hours';
  if (minutes <= 24 * 60) return 'within a day';
  if (minutes <= 3 * 24 * 60) return 'within a few days';
  const days = Math.round(minutes / (24 * 60));
  return `within ${days} days`;
};

// Auto-linkify plain-text URLs in the rendered event HTML so the
// `{{tracking_url}}` placeholder still becomes clickable even when an
// admin's template inserts it as plain text instead of wrapping it in
// `<a>` tags. Skips text already inside an `<a>` to avoid nested links.
// Whitelisted to http/https — keeps the dangerouslySetInnerHTML contract
// the same as before (only safe URL schemes ever get linked).
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/g;

const linkifyHtml = (html: string): string => {
  if (!html || !URL_PATTERN.test(html)) return html;
  if (typeof DOMParser === 'undefined') return html;
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return html;

    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Skip text inside <a> — don't double-link.
        let parent: Node | null = node.parentNode;
        while (parent && parent !== root) {
          if (parent.nodeName === 'A') return NodeFilter.FILTER_REJECT;
          parent = parent.parentNode;
        }
        return URL_PATTERN.test(node.nodeValue ?? '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });

    const textNodes: Text[] = [];
    let current: Node | null = walker.nextNode();
    while (current) {
      textNodes.push(current as Text);
      current = walker.nextNode();
    }
    for (const node of textNodes) {
      const text = node.nodeValue ?? '';
      // Reset regex.lastIndex because /g state persists across .exec.
      URL_PATTERN.lastIndex = 0;
      const fragment = doc.createDocumentFragment();
      let last = 0;
      let match: RegExpExecArray | null;
      while ((match = URL_PATTERN.exec(text))) {
        if (match.index > last) {
          fragment.appendChild(doc.createTextNode(text.slice(last, match.index)));
        }
        const anchor = doc.createElement('a');
        anchor.setAttribute('href', match[0]);
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
        anchor.textContent = match[0];
        fragment.appendChild(anchor);
        last = match.index + match[0].length;
      }
      if (last < text.length) {
        fragment.appendChild(doc.createTextNode(text.slice(last)));
      }
      node.parentNode?.replaceChild(fragment, node);
    }
    return root.innerHTML;
  } catch {
    return html;
  }
};

type ReplyState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

export const TrackingPage = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t');

  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; data: TrackingPayload }
  >({ kind: 'loading' });

  const [replyText, setReplyText] = useState('');
  const [replyState, setReplyState] = useState<ReplyState>({ kind: 'idle' });

  // Pull from the loaded payload — we need this in the handler closure so we
  // can refetch + ID the conv after a successful reply.
  // Returns true when the state was refreshed, false when the refetch failed.
  // The boolean is consumed by submitReply so we don't blow the customer's
  // typed text away on a transient refetch error — see G2 below.
  const refetch = (): Promise<boolean> => {
    if (!token) return Promise.resolve(false);
    return apiClient
      .get<{ success: boolean; data: TrackingPayload; error?: string }>(
        `/api/track/${encodeURIComponent(token)}`
      )
      .then((response) => {
        if (response.data.success && response.data.data) {
          setState({ kind: 'ok', data: response.data.data });
          return true;
        }
        return false;
      })
      .catch((err: unknown) => {
        logger.warn('[TrackingPage] refetch failed', err);
        return false;
      });
  };

  const submitReply = async (): Promise<void> => {
    if (!token) return;
    const trimmed = replyText.trim();
    if (!trimmed) return;
    if (trimmed.length > 4000) {
      setReplyState({ kind: 'error', message: 'Reply is too long (max 4,000 characters).' });
      return;
    }
    setReplyState({ kind: 'submitting' });
    try {
      const response = await apiClient.post<{
        success: boolean;
        data?: { eventId: number; sentAt: string };
        error?: string;
      }>(`/api/track/${encodeURIComponent(token)}/reply`, { content: trimmed });
      if (!response.data.success) {
        setReplyState({
          kind: 'error',
          message: response.data.error ?? 'Could not send your reply.',
        });
        return;
      }
      // The server has accepted the reply at this point. Refresh BEFORE
      // clearing the textarea so:
      //   - if refresh succeeds the new event is already in the timeline
      //     when the box empties (no flicker, no "did it go through?"
      //     moment)
      //   - if refresh fails we still clear (the reply IS sent — keeping
      //     the text invites duplicate submits) but show a notice so the
      //     customer knows to reload to see the latest state.
      const refetchOk = await refetch();
      setReplyText('');
      setReplyState(
        refetchOk
          ? { kind: 'idle' }
          : {
              kind: 'error',
              message:
                'Your reply was sent, but the page could not refresh. Please reload to see the latest.',
            }
      );
    } catch (err: unknown) {
      logger.warn('[TrackingPage] reply submit failed', err);
      // The server already shapes 4xx error envelopes with safe copy.
      const errObj = err as { response?: { data?: { error?: string }; status?: number } };
      const apiError = errObj?.response?.data?.error;
      const status = errObj?.response?.status;
      const fallback =
        status === 429
          ? "You've sent quite a few replies recently. Wait a bit and try again."
          : status === 409
            ? 'This request is closed. Email us back to start a new one.'
            : 'Something went wrong sending your reply. Please try again.';
      setReplyState({ kind: 'error', message: apiError ?? fallback });
    }
  };

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

  // 5-stage timeline matching the Request-tracking design. Each stage is
  // derived purely from the existing payload + event list — no new BE field
  // needed:
  //   - Received: always (the conversation exists)
  //   - Reviewed & categorized: bot_reply landed (the ack template fires
  //     after spam/intent classification, so its presence proves triage ran)
  //   - In progress: first non-automated agent event
  //   - Awaiting your reply: the latest event is from a human agent and the
  //     conversation is in `awaiting_response` server-state
  //   - Resolved: `resolvedAt || closedAt`
  const firstBotReplyAt =
    events.find((event) => event.direction === 'agent' && event.isAutomated)?.sentAt ?? null;
  const firstHumanReplyAt =
    events.find((event) => event.direction === 'agent' && !event.isAutomated)?.sentAt ?? null;
  const closedAt = conversation.resolvedAt ?? conversation.closedAt;

  // An agent counts as "working on it" if they've actually replied OR if the
  // server-side status has been explicitly moved to a working state (the
  // agent set it to `in_progress` / `pending` from the admin UI without yet
  // sending a reply). Falls back to `firstResponseAt` then `lastReplyAt`
  // then `createdAt` for the timestamp so the stage always has SOMETHING to
  // print when it's reached.
  const WORKING_STATUSES = ['in_progress', 'pending', 'awaiting_response', 'client_replied'];
  const isWorkingStatus = WORKING_STATUSES.includes(conversation.status);
  const inProgressReachedAt =
    firstHumanReplyAt ??
    conversation.firstResponseAt ??
    (isWorkingStatus ? conversation.lastReplyAt ?? conversation.createdAt : null) ??
    // If the conv was resolved/closed but we never saw a reply OR a working
    // status, someone still must have touched it to close it — back-infer
    // the in-progress stage from the resolution timestamp so the stepper
    // doesn't read as "received → resolved with a magic skip".
    (closedAt ?? null);

  const awaitingReplyAt =
    conversation.status === 'awaiting_response'
      ? firstHumanReplyAt ?? conversation.firstResponseAt ?? conversation.lastReplyAt
      : null;

  const timeline = [
    {
      key: 'received',
      label: 'Request received',
      desc: `We got your message and created this request.`,
      reachedAt: conversation.createdAt,
    },
    {
      key: 'reviewed',
      label: 'Reviewed & categorized',
      desc: department.name ? `Routed to ${department.name}.` : `We've sorted your request.`,
      reachedAt: firstBotReplyAt ?? conversation.firstResponseAt ?? null,
    },
    {
      key: 'in_progress',
      label: 'In progress',
      desc: `Our support team is looking into it.`,
      reachedAt: inProgressReachedAt,
    },
    {
      key: 'awaiting',
      label: 'Awaiting your reply',
      desc: `If we need more details, we'll ask here and email you.`,
      reachedAt: awaitingReplyAt,
    },
    {
      key: 'resolved',
      label: 'Resolved',
      desc: `We'll confirm the fix and close out the request.`,
      reachedAt: closedAt,
    },
  ];
  const activeIdx = timeline.reduce((acc, stage, idx) => (stage.reachedAt ? idx : acc), 0);
  const isResolved = !!closedAt;

  // Status-hero headline + sub-copy. Match the customer-facing tone of the
  // design — plain language, no internal jargon.
  const heroHeadline = isResolved
    ? 'Your request is resolved'
    : firstHumanReplyAt
      ? "We're working on your request"
      : 'We got your message';
  const heroSub = isResolved
    ? "If you have follow-up questions, reply to your confirmation email and we'll reopen this request."
    : firstHumanReplyAt
      ? "Our support team is on it. You'll get an email the moment there's an update — no need to refresh."
      : `Thanks — we've received this and a team member will pick it up shortly. We'll email you when there's an update.`;

  // Reference number: stable, customer-facing identifier. Padded so short ids
  // don't read as "throwaway" and long ones still fit the design's badge.
  const referenceNumber = `#REQ-${conversation.id.toString().padStart(4, '0')}`;

  // Channel label — only shown if we can infer one from the events. Stays
  // generic to avoid exposing internal source/integration names.
  const inboundChannel = events.find((event) => event.direction === 'customer')?.id ? 'Email' : null;

  return (
    <div className="min-h-screen bg-[hsl(210,20%,98%)] text-[hsl(222.2,84%,4.9%)] font-sans">
      {/* Top bar */}
      <header className="border-b border-[hsl(214.3,31.8%,91.4%)] bg-white">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
              {organization.name?.[0]?.toUpperCase() ?? 'O'}
            </div>
            <span className="font-semibold tracking-tight text-[15px]">
              {organization.name ?? 'Support'}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm text-[hsl(215.4,16.3%,46.9%)]">
            <span className="hidden sm:inline">Request</span>
            <span className="font-mono font-medium text-[hsl(222.2,84%,4.9%)] bg-[hsl(210,20%,98%)] border border-[hsl(214.3,31.8%,91.4%)] rounded-md px-2 py-0.5 text-[13px]">
              {referenceNumber}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8">
        {/* Status hero */}
        <section className="bg-white border border-[hsl(214.3,31.8%,91.4%)] rounded-xl p-6 sm:p-7 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            <div className="flex-shrink-0">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  isResolved
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-blue-50 text-blue-600'
                }`}
              >
                {isResolved ? (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15 14" />
                  </svg>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                    isResolved
                      ? 'text-emerald-700 bg-emerald-50'
                      : 'text-blue-700 bg-blue-50'
                  }`}
                >
                  {STATUS_LABELS[conversation.status]?.label ?? conversation.status}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{heroHeadline}</h1>
              <p className="text-[hsl(215.4,16.3%,46.9%)] mt-1.5 text-[15px] leading-relaxed">
                {heroSub}
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-sm">
                {!isResolved &&
                  !firstHumanReplyAt &&
                  typeof conversation.slaResponseMinutes === 'number' && (
                    <div className="flex items-center gap-1.5 text-[hsl(215.4,16.3%,46.9%)]">
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <polyline points="12 7 12 12 15 14" />
                      </svg>
                      Expected reply{' '}
                      <span className="text-[hsl(222.2,84%,4.9%)] font-medium">
                        {fmtSLAWindow(conversation.slaResponseMinutes)}
                      </span>
                    </div>
                  )}
                <div className="flex items-center gap-1.5 text-[hsl(215.4,16.3%,46.9%)]">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Handled by{' '}
                  <span className="text-[hsl(222.2,84%,4.9%)] font-medium">
                    {department.name ? `the ${department.name} team` : 'our support team'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          {/* Left column */}
          <div className="space-y-6 min-w-0">
            {/* Progress stepper */}
            <section className="bg-white border border-[hsl(214.3,31.8%,91.4%)] rounded-xl p-6">
              <h2 className="text-sm font-semibold mb-5">Progress</h2>
              <ol className="relative">
                {timeline.map((stage, idx) => {
                  // Reached = this specific stage actually has a reachedAt
                  // timestamp. Don't infer that earlier stages are "reached"
                  // just because a later stage is, because the conversation
                  // can skip stages (e.g., closed without an agent reply).
                  const reached = !!stage.reachedAt;
                  // Current = the next not-yet-reached stage right after the
                  // highest reached index. Hidden once resolved.
                  const isCurrent = idx === activeIdx + 1 && !isResolved;
                  const isLast = idx === timeline.length - 1;
                  const stageTime = stage.reachedAt
                    ? fmtRelative(stage.reachedAt) ?? fmtTime(stage.reachedAt)
                    : null;
                  return (
                    <li key={stage.key} className={`flex gap-3.5 relative ${isLast ? '' : 'pb-6'}`}>
                      {!isLast && (
                        <div
                          aria-hidden="true"
                          className={`absolute left-[11px] top-6 bottom-0 w-px ${
                            // Connector lights up only when BOTH this stage
                            // and the next stage are reached — gaps stay gray
                            // so a skipped stage reads as actually skipped.
                            reached && timeline[idx + 1].reachedAt
                              ? 'bg-blue-600'
                              : 'bg-[hsl(214.3,31.8%,91.4%)]'
                          }`}
                        />
                      )}
                      {!reached ? (
                        <div
                          aria-hidden="true"
                          className="relative z-10 w-6 h-6 rounded-full bg-white border-2 border-[hsl(214.3,31.8%,91.4%)] flex-shrink-0"
                        />
                      ) : isCurrent ? (
                        <div
                          aria-hidden="true"
                          className="relative z-10 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 ring-4 ring-blue-50"
                        >
                          <span className="w-2 h-2 rounded-full bg-white" />
                        </div>
                      ) : (
                        <div
                          aria-hidden="true"
                          className="relative z-10 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0"
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 -mt-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <p
                            className={`text-[15px] ${
                              isCurrent ? 'font-semibold' : 'font-medium'
                            } ${reached ? '' : 'text-[hsl(215.4,16.3%,46.9%)]'}`}
                          >
                            {stage.label}
                          </p>
                          {stageTime && (
                            <span
                              className="text-xs text-[hsl(215.4,16.3%,46.9%)] whitespace-nowrap"
                              title={stage.reachedAt ? fmtTime(stage.reachedAt) : undefined}
                            >
                              {isCurrent ? 'Now' : stageTime}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[hsl(215.4,16.3%,46.9%)] mt-0.5">{stage.desc}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            {/* Conversation */}
            <section className="bg-white border border-[hsl(214.3,31.8%,91.4%)] rounded-xl p-6">
              <h2 className="text-sm font-semibold mb-4">Conversation</h2>
              <div className="space-y-4">
                {events.length === 0 ? (
                  <p className="text-sm text-[hsl(215.4,16.3%,46.9%)]">No messages yet.</p>
                ) : (
                  events.map((event) => {
                    const isCustomer = event.direction === 'customer';
                    const time = fmtRelative(event.sentAt) ?? fmtTime(event.sentAt);
                    const senderLabel = isCustomer
                      ? 'You'
                      : event.isAutomated
                        ? 'Acknowledgment'
                        : 'Support';
                    return (
                      <div
                        key={event.id}
                        className={`flex gap-3 ${isCustomer ? '' : 'flex-row-reverse'}`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                            isCustomer
                              ? 'bg-[hsl(210,20%,98%)] border border-[hsl(214.3,31.8%,91.4%)] text-[hsl(215.4,16.3%,46.9%)]'
                              : 'bg-blue-600 text-white'
                          }`}
                          aria-hidden="true"
                        >
                          {isCustomer ? 'You' : event.isAutomated ? 'A' : 'S'}
                        </div>
                        <div
                          className={`flex-1 min-w-0 flex flex-col ${
                            isCustomer ? '' : 'items-end'
                          }`}
                        >
                          <div
                            className={`flex items-baseline gap-2 mb-1 ${
                              isCustomer ? '' : 'flex-row-reverse'
                            }`}
                          >
                            <span className="text-sm font-medium">{senderLabel}</span>
                            <span
                              className="text-xs text-[hsl(215.4,16.3%,46.9%)]"
                              title={fmtTime(event.sentAt)}
                            >
                              {time}
                            </span>
                          </div>
                          <div
                            className={`text-[15px] leading-relaxed px-3.5 py-2.5 rounded-lg max-w-[92%] prose prose-sm prose-a:underline ${
                              isCustomer
                                ? 'bg-[hsl(210,20%,98%)] border border-[hsl(214.3,31.8%,91.4%)] rounded-tl-sm prose-a:text-blue-700'
                                : 'bg-blue-600 text-white rounded-tr-sm prose-invert prose-a:text-white'
                            }`}
                            dangerouslySetInnerHTML={{ __html: linkifyHtml(event.content) }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {!isResolved && (
                <div className="mt-5 pt-5 border-t border-[hsl(214.3,31.8%,91.4%)]">
                  <label htmlFor="tracking-reply" className="text-sm font-medium mb-2 block">
                    Add to this request
                  </label>
                  <div
                    className={`rounded-lg border transition ${
                      replyState.kind === 'error'
                        ? 'border-red-500 focus-within:ring-2 focus-within:ring-red-500/20'
                        : 'border-[hsl(214.3,31.8%,91.4%)] focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20'
                    }`}
                  >
                    <textarea
                      id="tracking-reply"
                      rows={3}
                      maxLength={4000}
                      value={replyText}
                      disabled={replyState.kind === 'submitting'}
                      onChange={(ev) => {
                        setReplyText(ev.target.value);
                        if (replyState.kind === 'error') setReplyState({ kind: 'idle' });
                      }}
                      onKeyDown={(ev) => {
                        if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
                          ev.preventDefault();
                          void submitReply();
                        }
                      }}
                      placeholder="Reply, add details, or context that helps us answer…"
                      className="w-full px-3.5 py-2.5 text-[15px] bg-transparent resize-none focus:outline-none rounded-lg disabled:opacity-60"
                    />
                    <div className="flex items-center gap-2 px-3 py-2 border-t border-[hsl(214.3,31.8%,91.4%)]">
                      <span className="text-xs text-[hsl(215.4,16.3%,46.9%)]">
                        {replyText.length > 0
                          ? `${replyText.length.toLocaleString()} / 4,000`
                          : "We'll email you a copy of your reply."}
                      </span>
                      <button
                        type="button"
                        onClick={() => void submitReply()}
                        disabled={replyState.kind === 'submitting' || replyText.trim().length === 0}
                        className="ml-auto bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {replyState.kind === 'submitting' ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  </div>
                  {replyState.kind === 'error' && (
                    <p className="mt-2 text-xs text-red-600">{replyState.message}</p>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Right column — details */}
          <aside className="space-y-6">
            <section className="bg-white border border-[hsl(214.3,31.8%,91.4%)] rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-4">Request details</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[hsl(215.4,16.3%,46.9%)]">Reference</dt>
                  <dd className="font-mono font-medium">{referenceNumber}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[hsl(215.4,16.3%,46.9%)]">Submitted</dt>
                  <dd
                    className="font-medium text-right"
                    title={fmtTime(conversation.createdAt)}
                  >
                    {new Date(conversation.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </dd>
                </div>
                {inboundChannel && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[hsl(215.4,16.3%,46.9%)]">Channel</dt>
                    <dd className="font-medium">{inboundChannel}</dd>
                  </div>
                )}
                {department.name && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[hsl(215.4,16.3%,46.9%)]">Team</dt>
                    <dd className="font-medium">{department.name}</dd>
                  </div>
                )}
                {conversation.priority &&
                  conversation.priority !== 'low' &&
                  conversation.priority !== 'medium' && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-[hsl(215.4,16.3%,46.9%)]">Priority</dt>
                      <dd
                        className={`font-medium capitalize ${
                          conversation.priority === 'critical'
                            ? 'text-red-600'
                            : 'text-orange-600'
                        }`}
                      >
                        {conversation.priority}
                      </dd>
                    </div>
                  )}
                {firstHumanReplyAt && (
                  <div className="flex justify-between gap-3 pt-3 border-t border-[hsl(214.3,31.8%,91.4%)]">
                    <dt className="text-[hsl(215.4,16.3%,46.9%)]">First reply</dt>
                    <dd
                      className="font-medium text-right"
                      title={fmtTime(firstHumanReplyAt)}
                    >
                      {fmtRelative(firstHumanReplyAt) ?? fmtTime(firstHumanReplyAt)}
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="bg-white border border-[hsl(214.3,31.8%,91.4%)] rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-2">Need to reach us another way?</h2>
              <p className="text-sm text-[hsl(215.4,16.3%,46.9%)] mb-3">
                Reply to your confirmation email — that's the channel we currently watch and you'll
                land back on this page.
              </p>
            </section>

            <p className="text-xs text-[hsl(215.4,16.3%,46.9%)] px-1 leading-relaxed">
              This page updates as your request progresses. Bookmark it to check back anytime — we'll
              also email you at each step.
            </p>
          </aside>
        </div>
      </main>

      <footer className="border-t border-[hsl(214.3,31.8%,91.4%)] mt-10">
        <div className="max-w-5xl mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[hsl(215.4,16.3%,46.9%)]">
          <span>
            © {new Date().getFullYear()} {organization.name ?? 'odly'} · Support
          </span>
        </div>
      </footer>
    </div>
  );
};
