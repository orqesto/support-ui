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
      <button
        type="button"
        aria-pressed={value === 'managed'}
        onClick={() => onChoose('managed')}
        className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Card
          className={cn(
            'h-full cursor-pointer transition-colors hover:border-primary/60',
            value === 'managed' && 'border-primary ring-2 ring-primary'
          )}
        >
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">Use our AI</span>
              {value === 'managed' && <Check className="ml-auto h-4 w-4 text-primary" />}
            </div>
            <p className="text-sm text-muted-foreground">
              We handle model access for you — nothing to configure. Usage counts toward your
              plan&apos;s AI allowance.
            </p>
          </CardContent>
        </Card>
      </button>
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
