import { Bot, Check, KeyRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import {
  FREE_AI_ALLOWANCE_USED,
  starterAllowanceLine,
  type StarterAllowance,
} from '@/components/subscription/starterAllowance';

/**
 * Why a switch of the AI mode was refused. "Your free AI allowance is used" ONLY when the refusal
 * code says so: a generic `managed_ai_not_entitled` on Free can also be a failed allowance read
 * (the backend fails closed), so it keeps the generic sentence.
 */
export const modeSwitchErrorText = (code: string | undefined, fallback: string | undefined) => {
  switch (code) {
    case FREE_AI_ALLOWANCE_USED:
      return 'Your free AI allowance is used. Connect your own provider, or upgrade your plan.';
    case 'managed_ai_not_entitled':
      return 'Managed AI is not available on your current plan. Upgrade your plan, or connect your own provider.';
    case 'managed_ai_requires_verified_admin':
      return 'This workspace has no admin with a verified email. One of its admins must verify their email before managed AI can be enabled.';
    default:
      return fallback ?? 'Failed to change AI mode.';
  }
};

type AiMode = 'byo' | 'managed';

type Props = {
  /** The org's current live AI mode, or undefined while loading. */
  mode: AiMode | undefined;
  /** True when the platform has a managed key configured (managed is offerable at all). */
  managedAvailable: boolean;
  /** Disables the cards while a switch request is in flight. */
  saving: boolean;
  onSelect: (mode: AiMode) => void;
  /**
   * Free only: the one-time starter allowance on our AI (absent on paid plans and on an older
   * backend). With some left, "Use our AI" can be switched (back) on — Free stays on our AI after
   * the trial; used up, the backend refuses managed, so the card says why instead.
   */
  starter?: StarterAllowance;
  /**
   * The workspace is on Free (plan read from the subscription). Free's "Use our AI" is a one-time
   * starter allowance, never "Included in your plan" — also when the allowance block is absent
   * (no verified admin, an older backend). Audit A-F4.
   */
  isFree?: boolean;
  /** A switch to our AI was just refused with FREE_AI_ALLOWANCE_USED. */
  allowanceUsed?: boolean;
};

/** The "Use our AI" card's sentence while it can be chosen (or is the current mode). */
export const managedCardText = (starter: StarterAllowance | undefined, isFree: boolean): string => {
  if (starter) {
    return `We provide the AI from a one-time starter allowance on us — then connect your own provider or upgrade. ${starterAllowanceLine(starter, false)}`;
  }
  if (isFree) {
    return 'On Free we provide the AI from a one-time starter allowance on us — then connect your own provider or upgrade.';
  }
  return 'We provide the AI — no keys to manage, nothing to configure. Included in your plan.';
};

/**
 * Live AI-provider mode switch shown in Settings → Integrations → AI Providers (org_admin
 * only). Distinct from the onboarding wizard's `AiChoiceStep`, which records an *intent*
 * applied on finish — this flips the org's actual `settings.aiMode` immediately via
 * `PATCH /organizations/ai-mode/self`. Managed is money-sensitive, so the BE 403-gates it
 * (entitlement + verified admin); the parent surfaces the reason.
 */
export const AiProviderModeSwitch = ({
  mode,
  managedAvailable,
  saving,
  onSelect,
  starter,
  isFree = false,
  allowanceUsed = false,
}: Props) => {
  const starterUsed = (starter?.exhausted === true || allowanceUsed) && mode !== 'managed';
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-display text-sm font-medium text-foreground">AI provider mode</h3>
        <p className="text-sm text-muted-foreground">
          Use our managed AI (no keys to manage) or connect your own provider. You can switch
          anytime.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {managedAvailable && starterUsed ? (
          <div aria-disabled className="rounded-lg" data-testid="managed-ai-starter-used">
            <Card className="h-full border-dashed opacity-70">
              <CardContent className="space-y-2 p-5">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium text-foreground">Use our AI</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your free AI allowance is used. Connect your own provider below to keep AI
                  running, or upgrade your plan.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : managedAvailable ? (
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
                  <Bot className="h-5 w-5 text-ai" />
                  <span className="font-medium text-foreground">Use our AI</span>
                  {mode === 'managed' && (
                    <Check className="ml-auto h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground" data-testid="managed-ai-card-text">
                  {managedCardText(starter, isFree)}
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
                <KeyRound className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">Bring your own keys</span>
                {mode === 'byo' && <Check className="ml-auto h-4 w-4 text-muted-foreground" />}
              </div>
              <p className="text-sm text-muted-foreground">
                Connect your own provider (OpenAI, Anthropic, Bedrock, …) below. You pay the
                provider directly.
              </p>
            </CardContent>
          </Card>
        </button>
      </div>
    </div>
  );
};
