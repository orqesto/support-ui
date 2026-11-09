import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';
import type { AiStatus } from './aiStatus';
import { AI_KEY_SETTINGS_PATH, unavailableText } from './starterAllowance';

/**
 * A Free workspace with no AI at all (`ai.unavailableReason`, BE #1112):
 * - 'admin_not_verified': no workspace admin has verified their email address and there is no own
 *   key. Admins read "Verify your email address…" with Resend verification email + AI settings.
 * - 'own_key_required': admins read "Add your own AI key to use AI." with AI settings.
 * Agents read who can fix it, with no actions. No reason (older backend, AI available) ⇒ nothing.
 */
export const AiUnavailableNotice = ({
  ai,
  isAdmin,
}: {
  ai: AiStatus | undefined;
  isAdmin: boolean;
}) => {
  const email = useAuthStore((state) => state.user?.email);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const reason = ai?.unavailableReason;
  const text = unavailableText(reason, isAdmin);
  if (!text) return null;

  const resend = async () => {
    if (!email) return;
    setSending(true);
    try {
      await authService.resendVerification(email);
      setSent(true);
      toast.success('Verification email sent. Check your inbox.');
    } catch (error) {
      logger.warn('Could not resend the verification email:', error);
      toast.failure('send the verification email', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      data-testid="ai-unavailable-notice"
      data-reason={reason}
      className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
    >
      <span className="flex items-center gap-2 text-foreground">
        <KeyRound className="h-4 w-4 shrink-0 text-warning" />
        <span>{text}</span>
      </span>
      {isAdmin && (
        <span className="flex shrink-0 flex-wrap items-center gap-3">
          {reason === 'admin_not_verified' && email && (
            <Button
              variant="ghost"
              size="sm"
              isLoading={sending}
              disabled={sending || sent}
              onClick={() => void resend()}
            >
              {sent ? 'Verification email sent' : 'Resend verification email'}
            </Button>
          )}
          <Link to={AI_KEY_SETTINGS_PATH} className="font-medium text-primary hover:underline">
            AI settings
          </Link>
        </span>
      )}
    </div>
  );
};
