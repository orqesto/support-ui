import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { integrationsService } from '@/services/integrations.service';
import { logger } from '@/lib/logger';
import type { AutoReplyMode } from '@/services/organization.service';

/**
 * What is about to be switched on:
 * - `first`: automatic replies are enabled for the first time (no stored choice of what replies).
 *   It is saved as keyword rules only — AI-written replies are a separate, later choice.
 * - `again`: enabled again with the choice stored before (`mode`).
 * - `ai`: the choice is changed to keyword rules AND AI replies (`from` = the choice before).
 * - `kb`: from "Check only" to "Keyword rules only" — the keyword rules, checked and not sent
 *   until now, start being sent.
 * - `wider`: a team's overrides are reset and something it limited gets wider (`changes`).
 */
export type AutoReplyStart = {
  kind: 'first' | 'again' | 'ai' | 'kb' | 'wider';
  mode: AutoReplyMode;
  /** The choice before a change of choice. */
  from?: AutoReplyMode;
  /** One team's own setting; absent = the workspace's. */
  team?: { id: number; name: string };
  /** What a reset of the team's overrides widens, each as a sentence. */
  changes?: string[];
};

type Mailboxes =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; sending: string[]; off: number };

/**
 * The connected mailboxes automatic replies can send from, by the backend's rule (autoReplyGate
 * `isSourceLinkAutoReplyAllowed`, a hard stop since 2026-11-23). A mailbox's "Automatic replies"
 * switch is kept per team it is linked to:
 * - a thread of a team the mailbox is linked to ⇒ that link's switch decides;
 * - a thread of another team, or of no team ⇒ sent only if the mailbox has the switch on for at
 *   least one team; a mailbox whose switches are ALL off sends nothing;
 * - a mailbox linked to no team at all sends (threads from before the links existed).
 * So for the workspace a mailbox sends unless every switch it has is off; for one team, its own
 * link decides when there is one. Read for the whole workspace, whatever team is selected in the
 * header.
 */
const readMailboxes = async (teamId: number | undefined): Promise<Mailboxes> => {
  const all = (await integrationsService.getAll({ everyTeam: true })).data ?? [];
  const mailboxes = all.filter(
    (source) => source.enabled && (source.type === 'email' || source.type === 'gmail')
  );
  const rows = await Promise.all(
    mailboxes.map(async (source) => {
      const links =
        (await integrationsService.getSourceDepartments(source.id, { everyTeam: true })).data ?? [];
      const own =
        teamId === undefined ? undefined : links.find((link) => link.departmentId === teamId);
      return {
        label: (source.config as { user?: string } | undefined)?.user ?? source.name,
        sends: own
          ? own.autoReplyEnabled
          : links.length === 0 || links.some((link) => link.autoReplyEnabled),
      };
    })
  );
  return {
    state: 'ready',
    sending: rows.filter((row) => row.sends).map((row) => row.label),
    off: rows.filter((row) => !row.sends).length,
  };
};

/** Said wherever keyword rules are about to send (the settings card says the same). */
export const RULE_MEANING_NOTE =
  'Every keyword rule reply is checked first: the AI reads whether the customer is really asking what the rule answers, and holds the reply for a person if not. With no AI provider configured, rule replies are held.';

/** These settings are the EMAIL replies': a Telegram bot and a website chat have their own switches. */
export const EMAIL_ONLY_NOTE =
  'This covers email only: Telegram bots and website chat widgets answer for real unless their own switches are off.';

const title = (start: AutoReplyStart): string => {
  const scope = start.team ? ` for ${start.team.name}` : '';
  if (start.kind === 'wider') return `Reset all overrides${scope}?`;
  if (start.kind === 'kb') return `Let keyword rules send${scope}?`;
  return start.kind === 'ai'
    ? `Let the AI reply on its own${scope}?`
    : `Switch on automatic email replies${scope}?`;
};

const UNREAD = 'without a person reading them first';
const what = (start: AutoReplyStart): string => {
  if (start.kind === 'wider')
    return 'This team goes back to the workspace settings. That changes what is sent for it:';
  if (start.kind === 'kb')
    return `Your keyword rules — those with a fixed text and those that add a knowledge base answer ("Template + KB") — will be emailed to customers ${UNREAD}. Until now they were checked and not sent.`;
  if (start.kind === 'ai')
    return start.from === 'check_only'
      ? `Your keyword rules AND AI-written answers from your knowledge base, with the AI's questions for missing details, will be emailed to customers ${UNREAD}. Until now they were checked and not sent.`
      : `AI-written answers from your knowledge base, and the AI’s questions for missing details, will be emailed to customers ${UNREAD} — as your keyword rules already are.`;
  if (start.mode === 'all')
    return `Your keyword rules AND AI-written answers from your knowledge base will be emailed to customers ${UNREAD}.`;
  return start.mode === 'check_only'
    ? 'Nothing will be emailed. Keyword rule replies and AI replies are written and checked; one that passed every check is kept as the thread’s draft and recorded as "would have been sent". A mailbox’s fixed receipt confirmation still goes out.'
    : `Your keyword rules will be emailed to customers ${UNREAD}.`;
};

/** What a team with its own, wider choice sends. */
const EXCEPTION_SENDS: Record<'all' | 'rules_only', string> = {
  all: 'keyword rules and AI replies are emailed',
  rules_only: 'keyword rules are emailed',
};

/** The confirmation before automatic replies start sending, naming the mailboxes they send from. */
export function AutoReplyStartConfirm({
  start,
  exceptions,
  onConfirm,
  onClose,
}: {
  /** null = closed. */
  start: AutoReplyStart | null;
  /** Teams whose own choice sends more than this confirmation says, with what they send. */
  exceptions: Array<{ team: string; mode: 'all' | 'rules_only' }>;
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
    readMailboxes(teamId).then(
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
      // Closed: the next opening starts from "reading", never from this opening's list.
      setMailboxes({ state: 'loading' });
    };
  }, [open, teamId, attempt]);

  if (!start) return null;
  const aiStaysOff = start.kind !== 'ai' && start.mode === 'rules_only';
  const aiChecksOnly = start.kind !== 'ai' && start.mode === 'check_only';
  const checkOnly = start.mode === 'check_only' && start.kind !== 'wider';
  // Keyword rules send in every choice but "check only": their reply is checked for meaning.
  const rulesSend = start.mode !== 'check_only';
  const confirmText = {
    first: 'Switch on',
    again: 'Switch on',
    ai: 'Let the AI reply',
    kb: 'Let them send',
    wider: 'Reset',
  }[start.kind];
  const team = start.team?.name;
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
      confirmText={confirmText}
      description={
        <div className="space-y-3" data-testid="auto-reply-start-confirm">
          <p>{what(start)}</p>
          {start.changes && start.changes.length > 0 && (
            <ul className="pl-5 list-disc" aria-label="What this reset changes">
              {start.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          )}
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
          {mailboxes.state === 'ready' && mailboxes.sending.length > 0 && (
            <div>
              <p>
                {checkOnly
                  ? `Mail arriving at these mailboxes${team ? ` for ${team}` : ''} is checked:`
                  : team
                    ? `For ${team}, they can be sent from:`
                    : 'They can be sent from:'}
              </p>
              <ul
                className="pl-5 mt-1 list-disc"
                aria-label="Mailboxes that send automatic replies"
              >
                {mailboxes.sending.map((label) => (
                  <li key={label} className="font-mono text-[12.5px]">
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mailboxes.state === 'ready' && mailboxes.sending.length === 0 && (
            <p>
              {mailboxes.off === 0
                ? 'No mailbox is connected, so nothing is sent until one is.'
                : `Every mailbox has its "Automatic replies" switch off${team ? ` for ${team}` : ''}, so nothing is sent until one is switched on (Settings → Integrations).`}
            </p>
          )}
          {mailboxes.state === 'ready' && mailboxes.sending.length > 0 && mailboxes.off > 0 && (
            <p className="text-muted-foreground">
              {mailboxes.off === 1
                ? '1 other mailbox has'
                : `${mailboxes.off} other mailboxes have`}{' '}
              {team
                ? `the "Automatic replies" switch off for ${team} and ${mailboxes.off === 1 ? 'sends' : 'send'} nothing for this team.`
                : `the "Automatic replies" switch off for every team ${mailboxes.off === 1 ? 'it is' : 'they are'} linked to and ${mailboxes.off === 1 ? 'sends' : 'send'} nothing.`}
            </p>
          )}
          {aiStaysOff && start.kind !== 'wider' && (
            <p>
              The AI&apos;s own replies stay off. A keyword rule that adds a knowledge base answer
              (&quot;Template + KB&quot;) does send that answer. Letting the AI reply on its own is
              a separate choice: &quot;Keyword rules and AI replies&quot; under &quot;What replies
              on its own&quot;.
            </p>
          )}
          {aiChecksOnly && (
            <p>
              Letting them be sent is a separate choice under &quot;What replies on its own&quot;:
              &quot;Keyword rules only&quot; or &quot;Keyword rules and AI replies&quot;.
            </p>
          )}
          {!start.team && exceptions.length > 0 && (
            <div>
              <p>Except for these teams, which have their own choice:</p>
              <ul className="pl-5 mt-1 list-disc" aria-label="Teams that send more">
                {exceptions.map((exception) => (
                  <li key={exception.team}>
                    {exception.team} — {EXCEPTION_SENDS[exception.mode]}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {rulesSend && <p className="text-muted-foreground">{RULE_MEANING_NOTE}</p>}
          <p className="text-muted-foreground">{EMAIL_ONLY_NOTE}</p>
          <p className="text-muted-foreground">
            Every automatic reply is checked before it is sent; one that fails a check is held for a
            person.
          </p>
        </div>
      }
    />
  );
}
