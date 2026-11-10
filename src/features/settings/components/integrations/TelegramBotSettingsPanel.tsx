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
  type TelegramBotCommand,
  type TelegramBotSettings,
} from '@/features/settings/services/telegramBotSettings.service';
import { getApiErrorMessage } from '@/lib/errorMessages';
import type { AlertState } from '@/types/alert';

/**
 * A Telegram connection's bot: its menu commands with a reply per language, and how long a chat
 * must be quiet before the bot answers a chat it handed to a person (owner, 2026-11-10). Saving
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
  const [settings, setSettings] = useState<TelegramBotSettings | null>(null);
  const [consoleQuiet, setConsoleQuiet] = useState<ConsoleQuietHours | null>(null);
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
        setSettings(data.settings);
        setConsoleQuiet(data.consoleQuietHours);
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
  if (!settings) {
    return <div className="p-3 mt-2 text-sm text-muted-foreground">Loading bot settings…</div>;
  }

  const updateCommand = (index: number, patch: Partial<TelegramBotCommand>) =>
    setSettings({
      ...settings,
      commands: settings.commands.map((entry, at) =>
        at === index ? { ...entry, ...patch } : entry
      ),
    });
  const removeCommand = (index: number) =>
    setSettings({ ...settings, commands: settings.commands.filter((_, at) => at !== index) });
  const addCommand = () =>
    setSettings({
      ...settings,
      commands: [
        ...settings.commands,
        { command: '', enabled: true, description: '', replies: { en: '' } },
      ],
    });
  const setReply = (index: number, language: string, text: string) =>
    updateCommand(index, { replies: { ...settings.commands[index].replies, [language]: text } });
  const removeReply = (index: number, language: string) => {
    const { [language]: _removed, ...rest } = settings.commands[index].replies;
    updateCommand(index, { replies: rest });
  };
  const addReply = (index: number) => {
    const code = (newLanguage[index] ?? '').trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(code) || code in settings.commands[index].replies) return;
    setReply(index, code, '');
    setNewLanguage({ ...newLanguage, [index]: '' });
  };

  const problem = botSettingsProblem(settings, maxCommands);

  const save = async () => {
    if (problem) return;
    setSaving(true);
    try {
      const saved = await telegramBotSettingsService.save(integrationId, settings);
      setSettings(saved.settings);
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
          value={settings.quietHours ?? ''}
          placeholder={consoleQuiet ? `Console default: ${consoleQuiet.value}` : ''}
          onChange={(event) =>
            setSettings({
              ...settings,
              quietHours: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          A chat the bot handed to a person: once nobody has written in it for this long, the bot
          answers the customer again. Order-number statuses are always answered. Empty = the console
          default.
        </p>
      </div>

      {settings.commands.map((entry, index) => {
        const builtIn = BUILT_IN_COMMANDS.includes(entry.command);
        return (
          <div
            key={builtIn ? entry.command : `custom-${index}`}
            className="p-3 space-y-2 rounded border"
          >
            <div className="flex flex-wrap gap-2 justify-between items-center">
              {builtIn ? (
                <span className="font-mono text-sm">/{entry.command}</span>
              ) : (
                <Input
                  aria-label="Command name"
                  value={entry.command}
                  placeholder="shipping"
                  onChange={(event) =>
                    updateCommand(index, {
                      command: event.target.value.replace(/^\//, '').toLowerCase(),
                    })
                  }
                />
              )}
              <div className="flex gap-2 items-center">
                <Toggle
                  checked={entry.enabled}
                  onChange={(enabled) => updateCommand(index, { enabled })}
                  label={entry.enabled ? 'On' : 'Off'}
                  ariaLabel={`/${entry.command || 'command'} on`}
                />
                {!builtIn && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCommand(index)}
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
              onChange={(event) => updateCommand(index, { description: event.target.value })}
            />
            {Object.entries(entry.replies).map(([language, text]) => (
              <div key={language} className="flex gap-2 items-start">
                <span className="pt-2 w-8 font-mono text-xs uppercase">{language}</span>
                <Textarea
                  aria-label={`Reply in ${language}`}
                  rows={2}
                  value={text}
                  onChange={(event) => setReply(index, language, event.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeReply(index, language)}
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
                value={newLanguage[index] ?? ''}
                onChange={(event) =>
                  setNewLanguage({ ...newLanguage, [index]: event.target.value })
                }
              />
              <Button variant="outline" size="sm" onClick={() => addReply(index)}>
                <Plus className="w-4 h-4" />
                Language
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2 justify-between items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={addCommand}
          disabled={settings.commands.length >= maxCommands}
        >
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
