import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toggle } from '@/components/ui/Toggle';
import type { ShortTextLanguageSetting } from '@/services/platformSettings.service';
import { SourceBadge } from './SourceBadge';

/**
 * `ai.short_text_language`: a customer line of 2–7 words whose language nothing else tells (no
 * analysis yet, no language stored for the thread) is read by a small local model instead of
 * being taken for English. On by default. Switching is confirmed first, then saved on its own
 * (PUT /settings/drafts `{ shortTextLanguage }`) — every server picks it up within a minute.
 */
export const ShortTextLanguageSwitch = ({
  setting,
  saving,
  onSwitch,
}: {
  setting: ShortTextLanguageSetting;
  saving: boolean;
  onSwitch: (enabled: boolean) => void;
}) => {
  const [pending, setPending] = useState<boolean | null>(null);
  return (
    <div className="pt-3 space-y-1 border-t border-border">
      <Toggle
        checked={setting.value}
        disabled={saving}
        ariaLabel="Read the language of short messages"
        label={
          setting.value
            ? 'Read the language of short messages: on'
            : 'Read the language of short messages: off'
        }
        onChange={(next) => setPending(next)}
      />
      <SourceBadge source={setting.source} envLabel="Server setting" />
      <p className="text-xs text-muted-foreground">
        A message of 2 to 7 words whose language is not known yet is read by a local language model
        instead of being taken for English: the search, the reply language and the language stored
        for the thread follow it. A thread that already has a language keeps it. Off: short messages
        are taken for English, as before.
      </p>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={() => {
          if (pending !== null) onSwitch(pending);
          setPending(null);
        }}
        variant="warning"
        confirmText={pending ? 'Turn on' : 'Turn off'}
        title={
          pending
            ? 'Read the language of short messages?'
            : 'Stop reading the language of short messages?'
        }
        description={
          pending
            ? 'A new short message in another language will be searched and answered in that language, on each server within a minute.'
            : 'Every new short message without a known language will be searched and answered as English again, on each server within a minute.'
        }
      />
    </div>
  );
};
