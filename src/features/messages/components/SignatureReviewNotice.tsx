import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useWorkspaceNameWhen } from '@/hooks/useWorkspaceNameWhen';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/lib/toast';

/**
 * "Check your signature for <workspace>": shown above the reply box while the signature of this
 * workspace is the copy of the person's old one-for-every-workspace signature (each workspace now
 * has its own). Someone in several brand workspaces would otherwise keep signing one brand's mail
 * with another brand's sign-off. Gone once they keep it here or save it in Profile.
 */
export const SignatureReviewNotice = () => {
  const needsReview = useAuthStore((state) => state.user?.signatureNeedsReview === true);
  const signature = useAuthStore((state) => state.user?.signature?.trim() ?? '');
  const workspaceName = useWorkspaceNameWhen(needsReview);
  const [keeping, setKeeping] = useState(false);

  if (!needsReview) return null;

  const keep = async () => {
    setKeeping(true);
    try {
      await userService.confirmSignature();
      useAuthStore.setState((store) => ({
        user: store.user ? { ...store.user, signatureNeedsReview: false } : store.user,
      }));
    } catch (error) {
      toast.failure('keep the signature', error);
    } finally {
      setKeeping(false);
    }
  };

  return (
    <div data-testid="signature-review-notice">
      <Alert variant="warning" className="mx-3 mb-2 py-2">
        <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="min-w-0 flex-1">
            Check your signature for {workspaceName ?? 'this workspace'}. Each workspace now has its
            own, and this one was copied from your previous signature
            {signature ? <>: “{signature.split(/\s*\n\s*/).join(' · ')}”</> : null}.
          </span>
          <span className="flex flex-none items-center gap-2">
            <Button size="sm" variant="outline" onClick={keep} disabled={keeping}>
              {keeping ? 'Saving…' : 'Keep it'}
            </Button>
            <Link to="/settings#profile" className="underline hover:text-foreground">
              Edit in Profile
            </Link>
          </span>
        </AlertDescription>
      </Alert>
    </div>
  );
};
