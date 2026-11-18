import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { UserPhoto } from '@/components/ui/UserPhoto';
import { useRemovePlatformUserPhoto } from '@/hooks/usePlatformAdmin';

/**
 * Console → user → profile photo (moderation). Shown only when the person has a photo. Removing
 * it needs a reason: it is recorded in the platform audit log with who removed it. The person can
 * upload a new one afterwards; this is not a ban.
 */
export const PlatformUserPhotoCard = ({
  userId,
  email,
  photoKey,
}: {
  userId: number;
  email: string;
  photoKey: string | null | undefined;
}) => {
  const removal = useRemovePlatformUserPhoto();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  if (!photoKey) return null;

  const confirm = () =>
    removal.mutate(
      { id: userId, reason: reason.trim() },
      {
        onSuccess: () => {
          setAsking(false);
          setReason('');
          toast.success(`Photo removed for ${email}`);
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : 'Could not remove the photo'),
      }
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile photo</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 items-start">
          <span className="block w-16 h-16 rounded-full overflow-hidden bg-muted shrink-0">
            <UserPhoto photoKey={photoKey}>
              <ImageOff className="m-5 w-6 h-6 text-muted-foreground" />
            </UserPhoto>
          </span>
          {asking ? (
            <div className="flex-1 space-y-2">
              <Textarea
                id="pu-photo-reason"
                value={reason}
                rows={2}
                maxLength={500}
                placeholder="Reason (required) — e.g. Not a photo of the person"
                onChange={(event) => setReason(event.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setAsking(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={reason.trim().length === 0}
                  onClick={confirm}
                  isLoading={removal.isPending}
                >
                  Confirm remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-wrap gap-3 justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Shown to their teammates in every workspace they share.
              </span>
              <Button variant="outline" size="sm" onClick={() => setAsking(true)}>
                Remove photo
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
