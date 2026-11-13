import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import {
  BUILT_IN_COMMANDS,
  botSettingsProblem,
  telegramBotSettingsService,
  type ConsoleQuietHours,
  type ConsoleTurnLimits,
  turnLimitBounds,
  type TelegramBotCommand,
  type TelegramBotSettings,
} from '@/features/settings/services/telegramBotSettings.service';
import { getApiErrorMessage } from '@/lib/errorMessages';
import type { AlertState } from '@/types/alert';

/**
 * A command row as edited: a stable id (React key, the new-language box) and whether it is one of
 * the four built-ins — fixed when the row is created, never read from the name being typed (review
 * of #912: typing "cancel_order" passed through "cancel" and locked the row).
 */
type Row = TelegramBotCommand & { uid: number; builtIn: boolean };
let nextUid = 0;
const toRows = (commands: TelegramBotCommand[]): Row[] =>
  commands.map((entry) => ({
    ...entry,
    uid: (nextUid += 1),
    builtIn: BUILT_IN_COMMANDS.includes(entry.command),
  }));
const toCommands = (rows: Row[]): TelegramBotCommand[] =>
  rows.map(({ uid: _uid, builtIn: _builtIn, ...entry }) => entry);

/**
 * A Telegram connection's bot: its menu commands with a reply per language, and how long a chat
 * must be quiet (no message at all; closing does not count) before the bot answers a chat it
 * handed to a person (owner, 2026-11-10/11). Saving
 * also sets the bot's menu in Telegram.
 */
export const TelegramBotSettingsPanel = ({
  integrationId,
  onClose,
  onShowAlert,
}: {
  integrationId: number;
  onClose: () => void;
  onShowAlert: (alert: AlertState) => void;
}) => {
  const [quietHours, setQuietHours] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [consoleQuiet, setConsoleQuiet] = useState<ConsoleQuietHours | null>(null);
  // undefined = this backend has no flood / hang limit: the inputs are hidden and nothing is sent.
  const [floodWaitingLimit, setFloodWaitingLimit] = useState<number | null | undefined>(undefined);
  const [turnHangSeconds, setTurnHangSeconds] = useState<number | null | undefined>(undefined);
  const [consoleLimits, setConsoleLimits] = useState<ConsoleTurnLimits | null>(null);
  const [maxCommands, setMaxCommands] = useState(30);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newLanguage, setNewLanguage] = useState<Record<number, string>>({});

  useEffect(() => {
    let active = true;
    telegramBotSettingsService
      .get(integrationId)
      .then((data) => {
        if (!active) return;
        setQuietHours(data.settings.quietHours);
        setRows(toRows(data.settings.commands));
        setConsoleQuiet(data.consoleQuietHours);
        setFloodWaitingLimit(data.settings.floodWaitingLimit);
        setTurnHangSeconds(data.settings.turnHangSeconds);
        setConsoleLimits(data.consoleTurnLimits ?? null);
        if (data.maxCommands) setMaxCommands(data.maxCommands);
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(getApiErrorMessage(error) ?? 'The bot settings could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [integrationId]);

  if (loadError) {
    return (
      <div className="p-3 mt-2 text-sm rounded-lg border text-destructive" role="alert">
        {loadError}
      </div>
    );
  }
  if (!rows) {
    return <div className="p-3 mt-2 text-sm text-muted-foreground">Loading bot settings…</div>;
  }

  const settings: TelegramBotSettings = {
    quietHours,
    ...(floodWaitingLimit !== undefined ? { floodWaitingLimit } : {}),
    ...(turnHangSeconds !== undefined ? { turnHangSeconds } : {}),
    commands: toCommands(rows),
  };
  const asLimit = (text: string) => (text === '' ? null : Number(text));
  const updateRow = (uid: number, patch: Partial<TelegramBotCommand>) =>
    setRows(rows.map((row) => (row.uid === uid ? { ...row, ...patch } : row)));
  const removeRow = (uid: number) => setRows(rows.filter((row) => row.uid !== uid));
  const addRow = () =>
    setRows([
      ...rows,
      {
        command: '',
        enabled: true,
        description: '',
        replies: { en: '' },
        uid: (nextUid += 1),
        builtIn: false,
      },
    ]);
  const setReply = (row: Row, language: string, text: string) =>
    updateRow(row.uid, { replies: { ...row.replies, [language]: text } });
  const removeReply = (row: Row, language: string) => {
    const { [language]: _removed, ...rest } = row.replies;
    updateRow(row.uid, { replies: rest });
  };
  const addReply = (row: Row) => {
    const code = (newLanguage[row.uid] ?? '').trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(code) || code in row.replies) return;
    setReply(row, code, '');
    setNewLanguage({ ...newLanguage, [row.uid]: '' });
  };

  const limitBounds = turnLimitBounds(consoleLimits);
  const problem = botSettingsProblem(settings, maxCommands, limitBounds);

  const save = async () => {
    if (problem) return;
    setSaving(true);
    try {
      const saved = await telegramBotSettingsService.save(integrationId, settings);
      setQuietHours(saved.settings.quietHours);
      setFloodWaitingLimit(saved.settings.floodWaitingLimit);
      setTurnHangSeconds(saved.settings.turnHangSeconds);
      if (saved.consoleTurnLimits) setConsoleLimits(saved.consoleTurnLimits);
      setRows(toRows(saved.settings.commands));
      onShowAlert({
        open: true,
        title: 'Bot settings saved',
        description: saved.menu?.updated
          ? 'Saved. The bot’s menu in Telegram now shows the commands that are on.'
          : `Saved, but the bot’s menu could not be set in Telegram${saved.menu?.error ? `: ${saved.menu.error}` : ''}. The commands still work when typed.`,
        variant: saved.menu?.updated ? 'success' : 'warning',
      });
    } catch (error) {
      onShowAlert({
        open: true,
        title: 'Bot settings not saved',
        description: getApiErrorMessage(error) ?? 'The bot settings could not be saved.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 mt-2 space-y-4 rounded-lg border bg-muted/30">
      <div className="flex justify-between items-center">
        <p className="font-medium">Bot commands and replies</p>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close bot settings">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-1">
        <Input
          label="Answer again after quiet (hours)"
          type="number"
          min={1}
          max={720}
          step={1}
          value={quietHours ?? ''}
          placeholder={consoleQuiet ? `Console default: ${consoleQuiet.value}` : ''}
          onChange={(event) =>
            setQuietHours(event.target.value === '' ? null : Number(event.target.value))
          }
        />
        <p className="text-xs text-muted-foreground">
          A chat the bot handed to a person stays with people — also after it is closed or resolved
          — until there has been no message in it (from the customer, an agent or the bot) for this
          long; then the bot answers the customer again. Order-number statuses are always answered.
          Empty = the console default (one week).
        </p>
      </div>

      {floodWaitingLimit !== undefined && (
        <div className="space-y-1">
          <Input
            label="Flood limit (messages waiting in one chat)"
            type="number"
            min={limitBounds.flood.min}
            max={limitBounds.flood.max}
            step={1}
            value={floodWaitingLimit ?? ''}
            placeholder={
              consoleLimits
                ? `Console default: ${consoleLimits.telegramFloodWaitingLimit.value}`
                : ''
            }
            onChange={(event) => setFloodWaitingLimit(asLimit(event.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            When this many messages wait in one chat, the chat&rsquo;s next messages are saved for a
            person and the bot does not answer them. Empty = the console default.
          </p>
        </div>
      )}

      {turnHangSeconds !== undefined && (
        <div className="space-y-1">
          <Input
            label="Hang limit (seconds)"
            type="number"
            min={limitBounds.hang.min}
            max={limitBounds.hang.max}
            step={1}
            value={turnHangSeconds ?? ''}
            placeholder={
              consoleLimits ? `Console default: ${consoleLimits.telegramTurnHangSeconds.value}` : ''
            }
            onChange={(event) => setTurnHangSeconds(asLimit(event.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            A bot answer that runs longer than this no longer holds up the bot for other chats; the
            answer itself still goes on, and that chat&rsquo;s next messages still wait for it.
            Empty = the console default.
          </p>
        </div>
      )}

      {rows.map((entry) => {
        const { builtIn } = entry;
        return (
          <div key={entry.uid} className="p-3 space-y-2 rounded border">
            <div className="flex flex-wrap gap-2 justify-between items-center">
              {builtIn ? (
                <span className="font-mono text-sm">/{entry.command}</span>
              ) : (
                <Input
                  aria-label="Command name"
                  value={entry.command}
                  placeholder="shipping"
                  onChange={(event) =>
                    updateRow(entry.uid, {
                      command: event.target.value.replace(/^\//, '').toLowerCase(),
                    })
                  }
                />
              )}
              <div className="flex gap-2 items-center">
                <Toggle
                  checked={entry.enabled}
                  onChange={(enabled) => updateRow(entry.uid, { enabled })}
                  label={entry.enabled ? 'On' : 'Off'}
                  ariaLabel={`/${entry.command || 'command'} on`}
                />
                {!builtIn && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(entry.uid)}
                    aria-label={`Remove /${entry.command || 'command'}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
            {builtIn && (
              <p className="text-xs text-muted-foreground">
                {entry.command === 'newrequest' || entry.command === 'cancel'
                  ? 'Also ends a hand-over: the bot answers this customer again.'
                  : 'Replies even while a person handles the chat.'}
              </p>
            )}
            <Input
              label="Menu text"
              value={entry.description}
              onChange={(event) => updateRow(entry.uid, { description: event.target.value })}
            />
            {Object.entries(entry.replies).map(([language, text]) => (
              <div key={language} className="flex gap-2 items-start">
                <span className="pt-2 w-8 font-mono text-xs uppercase">{language}</span>
                <Textarea
                  aria-label={`Reply in ${language}`}
                  rows={2}
                  value={text}
                  onChange={(event) => setReply(entry, language, event.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeReply(entry, language)}
                  aria-label={`Remove the ${language} reply`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2 items-center">
              <Input
                aria-label="New reply language"
                placeholder="de"
                maxLength={2}
                value={newLanguage[entry.uid] ?? ''}
                onChange={(event) =>
                  setNewLanguage({ ...newLanguage, [entry.uid]: event.target.value })
                }
              />
              <Button variant="outline" size="sm" onClick={() => addReply(entry)}>
                <Plus className="w-4 h-4" />
                Language
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2 justify-between items-center">
        <Button variant="outline" size="sm" onClick={addRow} disabled={rows.length >= maxCommands}>
          <Plus className="w-4 h-4" />
          Add command
        </Button>
        <div className="flex gap-2 items-center">
          {problem && (
            <span className="text-xs text-destructive" role="alert">
              {problem}
            </span>
          )}
          <Button
            size="sm"
            onClick={() => void save()}
            isLoading={saving}
            disabled={problem !== null}
          >
            <Save className="w-4 h-4" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};
