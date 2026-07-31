import { Bot, KeyRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

type Props = {
  value: 'managed' | 'byo' | undefined;
  onChoose: (choice: 'managed' | 'byo') => void;
};

/**
 * Step 1 — "your AI or ours". Only records the intent in onboarding state;
 * managed mode is activated server-side once the managed-AI feature is live,
 * and BYO keys are configured later in Settings → AI Providers.
 */
export const AiChoiceStep = ({ value, onChoose }: Props) => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Choose how AI features (analysis, suggested answers, auto-replies) get their model access.
      You can change this later in Settings.
    </p>
    <div className="grid gap-4 sm:grid-cols-2">
      <button type="button" onClick={() => onChoose('managed')} className="text-left">
        <Card
          className={cn(
            'h-full cursor-pointer transition-colors hover:border-primary',
            value === 'managed' && 'border-primary ring-1 ring-primary'
          )}
        >
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">Use our AI</span>
            </div>
            <p className="text-sm text-muted-foreground">
              We handle model access for you — nothing to configure. Usage counts toward your
              plan&apos;s AI allowance.
            </p>
          </CardContent>
        </Card>
      </button>
      <button type="button" onClick={() => onChoose('byo')} className="text-left">
        <Card
          className={cn(
            'h-full cursor-pointer transition-colors hover:border-primary',
            value === 'byo' && 'border-primary ring-1 ring-primary'
          )}
        >
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">Bring your own keys</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Connect your own provider (OpenAI, Anthropic, Bedrock, …) after setup in Settings →
              AI Providers. You pay the provider directly.
            </p>
          </CardContent>
        </Card>
      </button>
    </div>
    {value === 'byo' && (
      <p className="text-sm text-muted-foreground">
        After finishing setup, add your provider key under{' '}
        <span className="font-medium text-foreground">Settings → AI Providers</span> — AI features
        stay off until a provider is configured.
      </p>
    )}
  </div>
);
