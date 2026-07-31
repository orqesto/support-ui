import { Bot, Check, KeyRound } from 'lucide-react';
import { AIProvidersSettings } from '@/components/settings/AIProvidersSettings';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

type Props = {
  value: 'managed' | 'byo' | undefined;
  onChoose: (choice: 'managed' | 'byo') => void;
};

/**
 * Step 2 — "your AI or ours". Records the intent in onboarding state; managed
 * mode is activated server-side once the managed-AI feature is live. Choosing
 * BYO reveals the provider setup inline so the client configures a key here in
 * the wizard (same AIProvidersSettings shown in Settings → Integrations).
 */
export const AiChoiceStep = ({ value, onChoose }: Props) => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Choose how AI features (analysis, suggested answers, auto-replies) get their model access.
      You can change this later in Settings.
    </p>
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Managed AI is not available on this build yet — shown as coming-soon and
          non-selectable so we never imply AI works when it doesn't. */}
      <div aria-disabled className="rounded-lg">
        <Card className="h-full border-dashed opacity-70">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium text-foreground">Use our AI</span>
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                Coming soon
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Managed model access is on the way — no keys to manage. For now, connect your own
              provider to turn on AI features.
            </p>
          </CardContent>
        </Card>
      </div>
      <button
        type="button"
        aria-pressed={value === 'byo'}
        onClick={() => onChoose('byo')}
        className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Card
          className={cn(
            'h-full cursor-pointer transition-colors hover:border-primary/60',
            value === 'byo' && 'border-primary ring-2 ring-primary'
          )}
        >
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">Bring your own keys</span>
              {value === 'byo' && <Check className="ml-auto h-4 w-4 text-primary" />}
            </div>
            <p className="text-sm text-muted-foreground">
              Connect your own provider (OpenAI, Anthropic, Bedrock, …) below. You pay the provider
              directly. AI features stay off until a provider is configured.
            </p>
          </CardContent>
        </Card>
      </button>
    </div>
    {value === 'byo' && (
      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm text-muted-foreground">
          Add a provider now — pick one, enter your API key, and save. You can add or change
          providers later in Settings → Integrations → AI Providers.
        </p>
        <AIProvidersSettings />
      </div>
    )}
  </div>
);
