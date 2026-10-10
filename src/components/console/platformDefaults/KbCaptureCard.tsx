import { BookOpenCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { useUpdatePlatformKb } from '@/hooks/usePlatformSettings';
import type { PlatformSettings } from '@/services/platformSettings.service';
import { SourceBadge } from './SourceBadge';

export const KB_CAPTURE_AI_LABEL = 'Rewrite captured questions with AI';
export const KB_CAPTURE_AI_DESCRIPTION =
  "When a workspace has AI, a captured email's question is rewritten as one clear question (checked against the original; falls back to the cleaned text). Off: rule-based cleaning only.";
export const KB_CAPTURE_NOT_DEPLOYED =
  'This server does not have this setting yet — it arrives with the next backend release.';

/**
 * Platform Defaults → Knowledge base: the `kb.capture_ai_question` platform setting. Absent from
 * an older backend's settings, and then nothing here can be switched — the card says why.
 */
export const KbCaptureCard = ({ kb }: { kb: PlatformSettings['kb'] }) => {
  const save = useUpdatePlatformKb();
  const setting = kb?.captureAiQuestion;
  return (
    <Card data-config-card="Knowledge base">
      <CardHeader>
        <CardTitle className="flex gap-2 items-center text-xl">
          <BookOpenCheck className="w-5 h-5" />
          Knowledge base
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 justify-between items-start">
          <div className="min-w-0">
            <p className="font-medium">{KB_CAPTURE_AI_LABEL}</p>
            <p className="text-sm text-muted-foreground">{KB_CAPTURE_AI_DESCRIPTION}</p>
            {setting ? (
              <div className="mt-1">
                <SourceBadge source={setting.source} />
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{KB_CAPTURE_NOT_DEPLOYED}</p>
            )}
          </div>
          {setting && (
            <Toggle
              checked={setting.value === true}
              disabled={save.isPending}
              onChange={(next) => save.mutate({ captureAiQuestion: next })}
              label={setting.value ? 'On' : 'Off'}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};
