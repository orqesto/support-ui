import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { UserPhoto } from '@/components/ui/UserPhoto';
import { apiErrorMessage } from '@/lib/apiError';
import { getInitials } from '@/lib/initials';
import { queryClient } from '@/lib/queryClient';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/stores/authStore';
import {
  clampView,
  cropPhoto,
  FRAME_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  shownSize,
  type PhotoView,
  type Size,
} from './photoCrop';

/** Same limits as the server (`PUT /api/users/me/photo`), checked first so nothing is sent. */
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

const SERVER_COPY: Record<string, string> = {
  PHOTO_TYPE: 'Use a PNG, JPEG or WebP image',
  PHOTO_UNREADABLE: 'We couldn’t read that image. Try another photo.',
  PHOTO_TOO_LARGE: 'That image is too large. Try a smaller photo.',
  UPLOAD_FILE_TOO_LARGE: 'Photo must be 10 MB or smaller',
};

const errorText = (error: unknown, fallback: string): string => {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
  return (typeof code === 'string' && SERVER_COPY[code]) || apiErrorMessage(error, fallback);
};

const CENTRED: PhotoView = { zoom: MIN_ZOOM, offsetX: 0, offsetY: 0 };

/**
 * Profile → photo. One photo per person, shown to teammates in every workspace they share. The
 * picked image is framed here (drag to move, zoom) and uploaded as the framed square; the server
 * shrinks it and strips its hidden data.
 */
export const ProfilePhotoField = () => {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [view, setView] = useState<PhotoView>(CENTRED);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; from: PhotoView } | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  if (!user) return null;
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;

  const changed = (photoKey: string | null) => {
    setUser({ ...user, photoKey });
    // Teammates' lists carry the key; this person's own screens refresh theirs now.
    void queryClient.invalidateQueries({ queryKey: ['presence-members'] });
  };

  const close = () => {
    setPreview(null);
    setNatural(null);
    setView(CENTRED);
  };

  const choose = (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return setError('Use a PNG, JPEG or WebP image');
    if (file.size > MAX_BYTES) return setError('Photo must be 10 MB or smaller');
    setError(null);
    setView(CENTRED);
    setPreview(URL.createObjectURL(file));
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const key = await userService.uploadPhoto(await cropPhoto(preview, view));
      changed(key);
      close();
    } catch (failure) {
      setError(errorText(failure, 'Couldn’t save your photo'));
      close();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await userService.removePhoto();
      changed(null);
    } catch (failure) {
      setError(errorText(failure, 'Couldn’t remove your photo'));
    } finally {
      setBusy(false);
    }
  };

  const moveTo = (next: PhotoView) => setView(natural ? clampView(natural, next) : next);
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, from: view };
  };
  const dragMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    moveTo({
      zoom: start.from.zoom,
      offsetX: start.from.offsetX + event.clientX - start.x,
      offsetY: start.from.offsetY + event.clientY - start.y,
    });
  };
  const shown = natural ? shownSize(natural, view.zoom) : null;

  return (
    <div className="flex items-center gap-4">
      <span
        aria-hidden
        className="grid place-items-center w-16 h-16 rounded-full overflow-hidden bg-primary text-primary-foreground text-lg font-semibold shrink-0"
      >
        <UserPhoto photoKey={user.photoKey}>{getInitials(name)}</UserPhoto>
      </span>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPTED.join(',')}
            aria-label="Choose a profile photo"
            className="sr-only"
            onChange={(event) => choose(event.target.files?.[0])}
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            <Camera className="w-4 h-4" />
            {user.photoKey ? 'Change photo' : 'Upload photo'}
          </Button>
          {user.photoKey && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="w-4 h-4" />
              Remove photo
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPEG or WebP, up to 10 MB. Teammates in your workspaces see it.
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Frame your photo</DialogTitle>
            <DialogClose onClose={close} />
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div
              className="relative overflow-hidden rounded-full bg-muted cursor-grab active:cursor-grabbing touch-none select-none"
              style={{ width: FRAME_PX, height: FRAME_PX }}
              onPointerDown={startDrag}
              onPointerMove={dragMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            >
              {preview && (
                <img
                  src={preview}
                  alt="Your new profile photo"
                  draggable={false}
                  onLoad={(event) =>
                    setNatural({
                      width: event.currentTarget.naturalWidth || FRAME_PX,
                      height: event.currentTarget.naturalHeight || FRAME_PX,
                    })
                  }
                  className="absolute max-w-none left-1/2 top-1/2"
                  style={{
                    width: shown?.width ?? FRAME_PX,
                    height: shown?.height ?? FRAME_PX,
                    transform: `translate(calc(-50% + ${view.offsetX}px), calc(-50% + ${view.offsetY}px))`,
                  }}
                />
              )}
            </div>
            <div className="w-full max-w-[240px]">
              <BarSlider
                value={view.zoom}
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                onChange={(zoom) => moveTo({ ...view, zoom })}
                ariaLabel="Zoom"
                ariaValueText={`${Math.round(view.zoom * 100)}%`}
              />
            </div>
            <p className="text-xs text-muted-foreground">Drag to move. The circle is what teammates see.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} isLoading={busy}>
              Save photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
