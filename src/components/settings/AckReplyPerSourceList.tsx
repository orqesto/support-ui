import { useEffect, useState } from 'react';
import { Mail, MessageSquareReply, Settings as SettingsIcon } from 'lucide-react';
import { AckReplyEditor } from '@/components/settings/integrations/AckReplyEditor';
import type { AlertState } from '@/components/settings/integrations/types';
import { Button } from '@/components/ui/Button';
import { logger } from '@/lib/logger';
import { integrationsService, type Integration } from '@/services/integrations.service';

/**
 * Acknowledgment auto-reply visibility on the AI Providers tab.
 *
 * Both kinds of auto-reply (the org-level AI reply + the per-source first-
 * touch acknowledgment with tracking link) are auto-actions on inbound
 * messages — they belong near each other. The ack-reply config used to live
 * only under Integrations → Message Sources, behind a kebab menu / icon
 * button labeled "Auto-reply Template", which sounded indistinguishable
 * from the AI Auto-Reply card here and made the two features look like one
 * (and made the org-level toggle look like it covered everything).
 *
 * This component surfaces the per-source ack-reply state as a list so
 * "who's sending the immediate ack?" is answerable without leaving the
 * AI Providers tab. Configure opens the canonical AckReplyEditor modal —
 * same component the Integrations cards use, so there's a single source
 * of truth for the editor UX.
 */

type Props = {
  onShowAlert: (alert: AlertState) => void;
};

export const AckReplyPerSourceList = ({ onShowAlert }: Props) => {
  const [sources, setSources] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null);

  const loadSources = async () => {
    try {
      setLoading(true);
      const res = await integrationsService.getAll();
      if (!res.success || !res.data) {
        setSources([]);
        return;
      }
      // Ack-reply is only meaningful on email/gmail — other channels
      // (slack, telegram) have their own first-touch semantics and the
      // BE explicitly short-circuits the ack path for them.
      setSources(res.data.filter((src) => src.type === 'email' || src.type === 'gmail'));
    } catch (err) {
      logger.error('[AckReplyPerSourceList] load failed', err);
      setSources([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSources();
  }, []);

  const editing = editingSourceId !== null
    ? sources.find((src) => src.id === editingSourceId) ?? null
    : null;

  return (
    <div className="p-5 rounded-lg border bg-card">
      <div className="flex gap-3 items-start mb-1">
        <MessageSquareReply className="w-5 h-5 text-muted-foreground mt-0.5" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Acknowledgment auto-reply</h3>
          <p className="text-xs text-muted-foreground">
            Per-source. Fires once on the first inbound message, separate from the AI
            auto-reply above. Carries the public tracking link.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="px-3 py-2 text-sm rounded-md border text-muted-foreground">
            Loading sources…
          </div>
        ) : sources.length === 0 ? (
          <div className="px-3 py-2 text-sm rounded-md border text-muted-foreground">
            No email or Gmail sources configured. Add one under Integrations → Message
            Sources to enable acknowledgment replies.
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {sources.map((source) => {
              const enabled = source.autoReplyEnabled === true;
              const hasBody = !!source.autoReplyBody && source.autoReplyBody.trim().length > 0;
              // The BE soft-skips enabled-but-empty bodies — surface that state
              // so an admin doesn't think it's wired and then wonder why no acks
              // are sending.
              const inactive = enabled && !hasBody;
              return (
                <li key={source.id} className="flex justify-between items-center px-3 py-2">
                  <div className="flex gap-3 items-center min-w-0">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{source.name}</div>
                      <div className="text-xs truncate text-muted-foreground">
                        {source.type === 'gmail' ? 'Gmail' : 'Email (SMTP/IMAP)'}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    {inactive ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        On · no body
                      </span>
                    ) : enabled ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                        On
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        Off
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingSourceId(source.id)}
                    >
                      <SettingsIcon className="mr-1 w-3.5 h-3.5" />
                      Configure
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <AckReplyEditor
          sourceId={editing.id}
          initial={{
            autoReplyEnabled: editing.autoReplyEnabled ?? false,
            autoReplySubject: editing.autoReplySubject ?? null,
            autoReplyBody: editing.autoReplyBody ?? null,
          }}
          onClose={() => setEditingSourceId(null)}
          onSaved={async () => {
            setEditingSourceId(null);
            await loadSources();
          }}
          onShowAlert={onShowAlert}
        />
      )}
    </div>
  );
};
