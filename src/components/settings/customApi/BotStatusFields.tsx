import { useState } from 'react';
import { Alert, AlertTitle } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import type { CustomApiEndpoint } from '@/services/customApi.service';

/** The backend's limit; the field stops at it rather than failing the save. */
export const BOT_REPLY_MAX = 300;

/** The built-in English wording, shown as the placeholder so the admin sees what goes out. */
export const BOT_STATUS_DEFAULT = 'Your order {order} is: {status}.';
export const BOT_NOT_FOUND_DEFAULT = "I couldn't find order {order}. Please check the number.";

/**
 * ODL-25 (2026-11-05): may the Telegram bot answer this lookup's STATUS by its number?
 *
 * ⛔ OFF by default, per lookup. Telegram brings no verified identity, so the bot says the status
 * and nothing else — the backend enforces that; this screen only says so.
 *
 * What the bot needs, read from the SAVED lookup (the backend reads the same four things, in
 * `botStatusBlockers`). A missing one means the switch alone sends nothing, so it is named.
 */
export type BotStatusBlocker = 'not_manual' | 'no_format' | 'no_identifier' | 'no_status';

export const BLOCKER_TEXT: Record<BotStatusBlocker, string> = {
  not_manual: 'It must take “Something the agent types, like an order number”.',
  no_format: 'It needs an example of one of your order numbers, so numbers are found in messages.',
  no_identifier: 'A field must be tagged “The number the customer quotes”.',
  no_status: 'A field must be tagged “Where it has got to”.',
};

export const botStatusBlockers = (
  endpoint: Pick<CustomApiEndpoint, 'parameterSource' | 'recordFormatLength' | 'fieldPaths'>
): BotStatusBlocker[] => {
  const roles = (endpoint.fieldPaths ?? []).map((field) => field.role);
  const blockers: BotStatusBlocker[] = [];
  if (endpoint.parameterSource !== 'manual') blockers.push('not_manual');
  if (!endpoint.recordFormatLength) blockers.push('no_format');
  if (!roles.includes('identifier')) blockers.push('no_identifier');
  if (!roles.includes('status')) blockers.push('no_status');
  return blockers;
};

/**
 * ⛔ ALWAYS SENT, blank wording as `null` (the built-in one). ⚠️ A backend without the columns drops
 * the keys (its schemas strip unknown keys), so the save still succeeds; nothing is kept.
 */
export const useBotStatus = (endpoint: CustomApiEndpoint | undefined) => {
  const [answers, setAnswers] = useState(endpoint?.botAnswersStatus === true);
  const [statusReply, setStatusReply] = useState(endpoint?.botStatusReply ?? '');
  const [notFoundReply, setNotFoundReply] = useState(endpoint?.botNotFoundReply ?? '');
  const payload = {
    botAnswersStatus: answers,
    botStatusReply: statusReply.trim() || null,
    botNotFoundReply: notFoundReply.trim() || null,
  };
  return {
    answers,
    setAnswers,
    statusReply,
    setStatusReply,
    notFoundReply,
    setNotFoundReply,
    payload,
  };
};

export type BotStatus = ReturnType<typeof useBotStatus>;

export const BotStatusFields = ({
  bot,
  endpoint,
}: {
  bot: BotStatus;
  endpoint: CustomApiEndpoint | undefined;
}) => {
  // A backend that predates the switch does not send it: offering it would save nothing.
  if (!endpoint || !('botAnswersStatus' in endpoint)) return null;
  const blockers = botStatusBlockers(endpoint);
  return (
    <div className="space-y-2" data-testid="bot-status-fields">
      <Toggle
        checked={bot.answers}
        onChange={bot.setAnswers}
        label="The Telegram bot may answer the order status by its number"
        ariaDescribedBy="ca-bot-status-help"
      />
      <p id="ca-bot-status-help" className="text-xs text-muted-foreground">
        When a customer sends an order number in Telegram, the bot replies with its status only —
        never a name, address, tracking, items or amounts, because Telegram does not tell us who is
        writing.
      </p>
      {bot.answers && blockers.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>The bot can’t use this lookup yet</AlertTitle>
          <ul className="list-disc pl-4">
            {blockers.map((blocker) => (
              <li key={blocker}>{BLOCKER_TEXT[blocker]}</li>
            ))}
          </ul>
          <p className="mt-1">Save the lookup after changing these.</p>
        </Alert>
      )}
      {bot.answers && (
        <>
          <Input
            id="ca-bot-status-reply"
            label="Reply with the status (optional)"
            value={bot.statusReply}
            maxLength={BOT_REPLY_MAX}
            placeholder={BOT_STATUS_DEFAULT}
            onChange={(event) => bot.setStatusReply(event.target.value)}
          />
          <Input
            id="ca-bot-not-found-reply"
            label="Reply when the number is not found (optional)"
            value={bot.notFoundReply}
            maxLength={BOT_REPLY_MAX}
            placeholder={BOT_NOT_FOUND_DEFAULT}
            onChange={(event) => bot.setNotFoundReply(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {'{order}'} is the number the customer sent and {'{status}'} its status. Left blank, the
            bot uses the wording shown, in the customer’s language.
          </p>
        </>
      )}
    </div>
  );
};
