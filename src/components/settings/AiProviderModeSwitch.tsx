import { Bot, Check, KeyRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

type AiMode = 'byo' | 'managed';

type Props = {
  /** The org's current live AI mode, or undefined while loading. */
  mode: AiMode | undefined;
  /** True when the platform has a managed key configured (managed is offerable at all). */
  managedAvailable: boolean;
  /** Disables the cards while a switch request is in flight. */
  saving: boolean;
  onSelect: (mode: AiMode) => void;
};

/**
 * Live AI-provider mode switch shown in Settings → Integrations → AI Providers (org_admin
 * only). Distinct from the onboarding wizard's `AiChoiceStep`, which records an *intent*
 * applied on finish — this flips the org's actual `settings.aiMode` immediately via
 * `PATCH /organizations/ai-mode/self`. Managed is money-sensitive, so the BE 403-gates it
 * (entitlement + verified admin); the parent surfaces the reason.
 */
export const AiProviderModeSwitch = ({ mode, managedAvailable, saving, onSelect }: Props) => (
  <div className="space-y-3">
    <div>
      <h3 className="text-sm font-medium text-foreground">AI provider mode</h3>
      <p className="text-sm text-muted-foreground">
        Use our managed AI (no keys to manage) or connect your own provider. You can switch
        anytime.
      </p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {managedAvailable ? (
        <button
          type="button"
          aria-pressed={mode === 'managed'}
          disabled={saving}
          onClick={() => onSelect('managed')}
          className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <Card
            className={cn(
              'h-full cursor-pointer transition-colors hover:border-primary/60',
              mode === 'managed' && 'border-primary ring-2 ring-primary'
            )}
          >
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Use our AI</span>
                {mode === 'managed' && <Check className="ml-auto h-4 w-4 text-primary" />}
              </div>
              <p className="text-sm text-muted-foreground">
                We provide the AI — no keys to manage, nothing to configure. Included in your plan.
              </p>
            </CardContent>
          </Card>
        </button>
      ) : (
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
                Managed model access isn&apos;t available yet. Connect your own provider below to
                turn on AI features.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <button
        type="button"
        aria-pressed={mode === 'byo'}
        disabled={saving}
        onClick={() => onSelect('byo')}
        className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
      >
        <Card
          className={cn(
            'h-full cursor-pointer transition-colors hover:border-primary/60',
            mode === 'byo' && 'border-primary ring-2 ring-primary'
          )}
        >
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">Bring your own keys</span>
              {mode === 'byo' && <Check className="ml-auto h-4 w-4 text-primary" />}
            </div>
            <p className="text-sm text-muted-foreground">
              Connect your own provider (OpenAI, Anthropic, Bedrock, …) below. You pay the provider
              directly.
            </p>
          </CardContent>
        </Card>
      </button>
    </div>
  </div>
);
