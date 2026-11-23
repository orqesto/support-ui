import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { integrationsService } from '@/services/integrations.service';
import { logger } from '@/lib/logger';
import type { AutoReplyMode } from '@/services/organization.service';

/**
 * What the workspace is about to switch on:
 * - `first`: automatic replies are enabled for the first time (no stored choice of what replies).
 *   It is saved as keyword rules only — AI-written replies are a separate, later choice.
 * - `again`: enabled again with the choice stored before (`mode`).
 * - `ai`: the choice is changed to keyword rules AND AI replies.
 */
export type AutoReplyStart = {
  kind: 'first' | 'again' | 'ai';
  mode: AutoReplyMode;
  /** One team's own setting; absent = the workspace's. */
  team?: { id: number; name: string };
};

type Mailboxes =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; allowed: string[]; off: number };

/**
 * The connected mailboxes automatic replies may send from: enabled email accounts whose own
 * "Automatic replies" switch (Integrations) is on for at least one team that has not switched
 * automatic replies off. A mailbox with no team link counts as allowed — the backend treats it so.
 */
const readMailboxes = async (
  teamIsOff: (departmentId: number) => boolean,
  teamId: number | undefined
): Promise<Mailboxes> => {
  const all = (await integrationsService.getAll()).data ?? [];
  const mailboxes = all.filter(
    (source) => source.enabled && (source.type === 'email' || source.type === 'gmail')
  );
  const rows = await Promise.all(
    mailboxes.map(async (source) => {
      const links = (await integrationsService.getSourceDepartments(source.id)).data ?? [];
      return {
        label: (source.config as { user?: string } | undefined)?.user ?? source.name,
        allowed:
          links.length === 0 ||
          links.some((link) =>
            teamId === undefined
              ? link.autoReplyEnabled && !teamIsOff(link.departmentId)
              : // One team: the mailboxes linked to it with their switch on.
                link.autoReplyEnabled && link.departmentId === teamId
          ),
      };
    })
  );
  return {
    state: 'ready',
    allowed: rows.filter((row) => row.allowed).map((row) => row.label),
    off: rows.filter((row) => !row.allowed).length,
  };
};

const title = (start: AutoReplyStart): string => {
  const scope = start.team ? ` for ${start.team.name}` : '';
  return start.kind === 'ai'
    ? `Let the AI reply on its own${scope}?`
    : `Switch on automatic email replies${scope}?`;
};

const what = (start: AutoReplyStart): string => {
  if (start.kind === 'ai')
    return 'AI-written answers from your knowledge base, and the AI’s questions for missing details, will be emailed to customers without a person reading them first — as your keyword rules already are.';
  return start.mode === 'all'
    ? 'Your keyword rules AND AI-written answers from your knowledge base will be emailed to customers without a person reading them first.'
    : 'Your keyword rules will be emailed to customers without a person reading them first.';
};

/** The confirmation before automatic replies start sending, naming the mailboxes they send from. */
export function AutoReplyStartConfirm({
  start,
  teamIsOff,
  teamsWithAi,
  onConfirm,
  onClose,
}: {
  /** null = closed. */
  start: AutoReplyStart | null;
  /** A team that switched automatic replies off for itself. */
  teamIsOff: (departmentId: number) => boolean;
  /** Teams whose own choice is "Keyword rules and AI replies", by name. */
  teamsWithAi: string[];
  onConfirm: (start: AutoReplyStart) => void;
  onClose: () => void;
}) {
  const [mailboxes, setMailboxes] = useState<Mailboxes>({ state: 'loading' });
  /** Bumped by "Try again" after a failed read. */
  const [attempt, setAttempt] = useState(0);
  const open = start !== null;
  const teamId = start?.team?.id;
  useEffect(() => {
    if (!open) return;
    let stale = false;
    setMailboxes({ state: 'loading' });
    readMailboxes(teamIsOff, teamId).then(
      (read) => {
        if (!stale) setMailboxes(read);
      },
      (error: unknown) => {
        logger.error('Automatic replies: the mailboxes could not be read', error);
        if (!stale) setMailboxes({ state: 'failed' });
      }
    );
    return () => {
      stale = true;
    };
    // Read once per opening: `teamIsOff` is a new function on every render of the settings card.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [open, teamId, attempt]);

  if (!start) return null;
  const aiStaysOff = start.kind !== 'ai' && start.mode === 'rules_only';
  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onConfirm={() => onConfirm(start)}
      title={title(start)}
      // Nothing is switched on while the mailboxes it would send from are not known.
      hideConfirm={mailboxes.state !== 'ready'}
      variant="warning"
      confirmText={start.kind === 'ai' ? 'Let the AI reply' : 'Switch on'}
      description={
        <div className="space-y-3" data-testid="auto-reply-start-confirm">
          <p>{what(start)}</p>
          {mailboxes.state === 'loading' && <p role="status">Reading your mailboxes…</p>}
          {mailboxes.state === 'failed' && (
            <div role="alert" className="space-y-2">
              <p>
                The mailboxes these replies would be sent from could not be read, so nothing is
                switched on.
              </p>
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
          {mailboxes.state === 'ready' && mailboxes.allowed.length > 0 && (
            <div>
              <p>
                {start.team ? `For ${start.team.name}, they are sent from:` : 'They are sent from:'}
              </p>
              <ul
                className="pl-5 mt-1 list-disc"
                aria-label="Mailboxes that send automatic replies"
              >
                {mailboxes.allowed.map((label) => (
                  <li key={label} className="font-mono text-[12.5px]">
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mailboxes.state === 'ready' && mailboxes.allowed.length === 0 && (
            <p>
              {start.team ? `No mailbox of ${start.team.name}` : 'No connected mailbox'} has its
              &quot;Automatic replies&quot; switch on, so nothing is sent until one is switched on
              (Settings → Integrations).
            </p>
          )}
          {mailboxes.state === 'ready' && mailboxes.off > 0 && (
            <p className="text-muted-foreground">
              {mailboxes.off === 1
                ? '1 other mailbox has its own switch off and sends nothing.'
                : `${mailboxes.off} other mailboxes have their own switch off and send nothing.`}
            </p>
          )}
          {aiStaysOff && (
            <p>
              AI-written replies stay off. They are a separate choice: &quot;Keyword rules and AI
              replies&quot; under &quot;What replies on its own&quot;.
            </p>
          )}
          {aiStaysOff && !start.team && teamsWithAi.length > 0 && (
            <p>
              Except for {teamsWithAi.join(', ')}:{' '}
              {teamsWithAi.length === 1 ? 'this team has' : 'these teams have'} their own choice,
              &quot;Keyword rules and AI replies&quot;.
            </p>
          )}
          <p className="text-muted-foreground">
            Every automatic reply is checked before it is sent; one that fails a check is held for a
            person.
          </p>
        </div>
      }
    />
  );
}
