// Per-source acknowledgment auto-reply editor (#19/#20 — gap #3 FE).
//
// Mounted inline below the source row in GmailIntegrationCard /
// EmailIntegrationCard when the admin clicks "Auto-reply" from the kebab
// menu. Three fields:
//
//   - Enabled toggle (boolean)
//   - Subject (optional; falls back to "Re: {{original_subject}}")
//   - HTML body (required when enabled)
//
// Token chips at the top of the body field document what's renderable:
// {{customer_name}}, {{tracking_url}}, {{original_subject}}. Clicking a
// chip inserts the literal token at the cursor.
//
// BE endpoint: PATCH /api/integrations/:id/ack-reply
// Note: the tracking_url renders a PUBLIC link — surface a warning copy.

import { useRef, useState } from 'react';
import { Save, X, AlertTriangle, Info } from 'lucide-react';
import type { AlertState } from '@/components/settings/integrations/types';
import RichTextEditor, { type RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { Button } from '@/components/ui/Button';
import { integrationsService } from '@/services/integrations.service';

type AckReplyEditorProps = {
  sourceId: number;
  initial: {
    autoReplyEnabled?: boolean | null;
    autoReplySubject?: string | null;
    autoReplyBody?: string | null;
  };
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onShowAlert: (alert: AlertState) => void;
};

const TOKENS = ['{{customer_name}}', '{{tracking_url}}', '{{original_subject}}'] as const;

// Server-side cap on `autoReplyBody` (see `sourceAckReplyController.ts:28`).
// Surfaced in the editor footer so admins see when they're approaching it.
const BODY_LIMIT = 100_000;

const DEFAULT_SUBJECT_PLACEHOLDER = 'Re: {{original_subject}}';
const DEFAULT_BODY_TEMPLATE =
  '<p>Hi {{customer_name}},</p>\n\n<p>Thanks for getting in touch. We\'ve received your message and a member of our team will get back to you shortly.</p>\n\n<p>You can track the status of your request here: <a href="{{tracking_url}}">{{tracking_url}}</a></p>\n\n<p>— The Support Team</p>';

export const AckReplyEditor = ({
  sourceId,
  initial,
  onClose,
  onSaved,
  onShowAlert,
}: AckReplyEditorProps) => {
  const [enabled, setEnabled] = useState<boolean>(initial.autoReplyEnabled ?? false);
  const [subject, setSubject] = useState<string>(initial.autoReplySubject ?? '');
  const [body, setBody] = useState<string>(initial.autoReplyBody ?? '');
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<RichTextEditorHandle | null>(null);

  // Insert a `{{token}}` chip at the cursor. For tracking_url we wrap it in
  // an `<a>` so the rendered email has a clickable link (matching the
  // default template); other tokens go in as plain text. The literal `{{…}}`
  // round-trips through the backend's template renderer unchanged either way.
  const insertTokenIntoBody = (token: string) => {
    const content =
      token === '{{tracking_url}}'
        ? `<a href="${token}">${token}</a>`
        : token;
    bodyRef.current?.insertText(content);
  };

  // Tiptap renders empty input as `<p></p>`; the backend treats that as
  // "no body". Normalize before any "is body empty?" check.
  const isBodyEmpty = (html: string): boolean => {
    const stripped = html.replace(/<[^>]+>/g, '').trim();
    return stripped.length === 0;
  };

  const handleSave = async () => {
    if (enabled && isBodyEmpty(body)) {
      onShowAlert({
        open: true,
        title: 'Body required',
        description: 'Add a body before enabling acknowledgment auto-reply.',
        variant: 'warning',
      });
      return;
    }
    if (body.length > BODY_LIMIT) {
      onShowAlert({
        open: true,
        title: 'Body too long',
        description: `Body exceeds the ${BODY_LIMIT.toLocaleString()}-character limit by ${(body.length - BODY_LIMIT).toLocaleString()}. Trim it before saving.`,
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const res = await integrationsService.updateAckReply(sourceId, {
        autoReplyEnabled: enabled,
        autoReplySubject: subject.trim() ? subject : null,
        autoReplyBody: isBodyEmpty(body) ? null : body,
      });
      if (!res.success) {
        onShowAlert({
          open: true,
          title: 'Save failed',
          description: 'Could not save the auto-reply template. Please try again.',
          variant: 'error',
        });
        return;
      }
      onShowAlert({
        open: true,
        title: enabled ? 'Auto-reply enabled' : 'Auto-reply settings saved',
        description: enabled
          ? 'Future first-inbound messages on this source will trigger the template.'
          : 'Auto-reply is off; no acknowledgments will be sent.',
        variant: 'success',
      });
      await onSaved();
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Could not save the auto-reply template.';
      onShowAlert({ open: true, title: 'Save failed', description: message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 mt-3 space-y-4 rounded-md border bg-muted/40">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="text-sm font-semibold">Acknowledgment auto-reply</h4>
          <p className="text-xs text-muted-foreground">
            Sends once per conversation, on the first inbound message. Includes a public tracking
            link.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <label className="flex gap-2 items-center text-sm">
        <input
          type="checkbox"
          className="w-4 h-4"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>Enabled</span>
      </label>

      <div>
        <label className="block mb-1 text-xs font-medium text-muted-foreground" htmlFor="ack-subject">
          Subject (optional)
        </label>
        <input
          id="ack-subject"
          type="text"
          maxLength={500}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder={DEFAULT_SUBJECT_PLACEHOLDER}
          className="px-3 py-2 w-full text-sm rounded-md border bg-input border-border focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Tokens: <code>{'{{original_subject}}'}</code>, <code>{'{{customer_name}}'}</code>. Falls back to
          “{DEFAULT_SUBJECT_PLACEHOLDER}” if left empty.
        </p>
      </div>

      <div role="group" aria-labelledby="ack-body-label">
        <div className="flex justify-between items-center mb-1">
          <span id="ack-body-label" className="text-xs font-medium text-muted-foreground">
            Body
          </span>
          <div className="flex gap-1">
            {TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => insertTokenIntoBody(token)}
                className="px-2 py-0.5 text-xs rounded border bg-background hover:bg-accent border-border"
                title={`Insert ${token}`}
              >
                {token}
              </button>
            ))}
            <button
              type="button"
              onClick={() => bodyRef.current?.setContent(DEFAULT_BODY_TEMPLATE)}
              className="px-2 py-0.5 text-xs rounded border bg-background hover:bg-accent border-border"
              title="Reset to default template"
            >
              Use default
            </button>
          </div>
        </div>
        <RichTextEditor
          ref={bodyRef}
          content={body}
          onChange={setBody}
          placeholder="Write the acknowledgment message. Use the chips above to insert template tokens."
          minHeight="180px"
          maxHeight="400px"
          initiallyHidden={false}
        />
        <div className="flex justify-between items-baseline mt-1">
          <p className="text-xs text-muted-foreground">
            Tokens you insert (e.g. <code>{'{{customer_name}}'}</code>) are stored as plain text and
            substituted when the email is sent — not visible to the customer.
          </p>
          {/* Server enforces max(100000) on autoReplyBody. Surface the count so admins
              know when they're close to the limit — the editor doesn't enforce it. */}
          <p
            className={
              body.length > BODY_LIMIT
                ? 'text-xs text-destructive shrink-0 ml-3'
                : 'text-xs text-muted-foreground shrink-0 ml-3'
            }
          >
            {body.length.toLocaleString()} / {BODY_LIMIT.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex gap-2 items-start p-3 text-xs rounded-md border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
        <AlertTriangle className="flex-shrink-0 mt-0.5 w-4 h-4" />
        <span>
          <strong>Public tracking link.</strong> The rendered <code>{'{{tracking_url}}'}</code> is
          accessible to anyone with the URL — no login required. It expires automatically 90 days
          after issue. Don’t include sensitive internal context in the template.
        </span>
      </div>

      <div className="flex gap-2 items-start p-3 text-xs rounded-md border bg-blue-50 border-blue-300 text-blue-900 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-200">
        <Info className="flex-shrink-0 mt-0.5 w-4 h-4" />
        <span>
          Customer-controlled values ({'{{customer_name}}'}, {'{{original_subject}}'}) are
          HTML-escaped before substitution, so script injection via display name is safe. CR/LF is
          stripped from the rendered Subject header.
        </span>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} isLoading={saving}>
          <Save className="mr-2 w-4 h-4" />
          Save
        </Button>
      </div>
    </div>
  );
};
