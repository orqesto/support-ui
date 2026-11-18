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
import { FilePicker } from '@/components/ui/FilePicker';
import { UserPhoto } from '@/components/ui/UserPhoto';
import { apiErrorMessage } from '@/lib/apiError';
import { getInitials } from '@/lib/initials';
import { ownPhotoChanged } from '@/lib/ownPhotoSignal';
import { queryClient } from '@/lib/queryClient';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/stores/authStore';
import {
  clampView,
  cropPhoto,
  drawFramed,
  FRAME_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  openPhoto,
  type Picture,
  type PhotoView,
} from './photoCrop';

/**
 * Largest original the browser will open for framing. Only the framed 512 px JPEG is uploaded
 * (the server's own 10 MB limit applies to that), so a large phone photo is fine.
 */
const MAX_BYTES = 40 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

const SERVER_COPY: Record<string, string> = {
  PHOTO_TYPE: 'Use a PNG, JPEG or WebP image',
  PHOTO_UNREADABLE: 'We couldn’t read that image. Try another photo.',
  PHOTO_TOO_LARGE: 'That image is too large. Try a smaller photo.',
  UPLOAD_FILE_TOO_LARGE: 'Photo must be 10 MB or smaller',
};

/** Our sentence for a refusal the person can act on, by the server's code; else null. */
const serverCopy = (error: unknown): string | null => {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
  return (typeof code === 'string' && SERVER_COPY[code]) || null;
};

/** Preview canvas pixels: the frame at 2x, sharp on high-density screens. */
const PREVIEW_PX = FRAME_PX * 2;

const CENTRED: PhotoView = { zoom: MIN_ZOOM, offsetX: 0, offsetY: 0 };

/**
 * Profile → photo. One photo per person, shown to teammates in every workspace they share. The
 * picked image is framed here (drag to move, zoom) and uploaded as the framed square; the server
 * shrinks it and strips its hidden data.
 */
export const ProfilePhotoField = () => {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [picture, setPicture] = useState<Picture | null>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<PhotoView>(CENTRED);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; from: PhotoView } | null>(null);

  // The preview is drawn with the export's own code, so the saved square is what the circle shows.
  useEffect(() => {
    const context = picture ? previewCanvas.current?.getContext('2d') : null;
    if (picture && context) drawFramed(context, picture, view, PREVIEW_PX);
  }, [picture, view]);

  // The profile object can come from a sign-in that did not carry the key (or from before this
  // feature): ask the server once. A server that does not send `photoKey` at all has no photo
  // routes yet (the app can reach production before the API), so the field stays hidden.
  const keyKnown = user !== null && 'photoKey' in user;
  const userId = user?.id ?? null;
  // The store's current user when the answer lands (not the one the request started from).
  const latestUser = useRef(user);
  latestUser.current = user;
  // Once per person, not on every store change (review 8b, F8).
  useEffect(() => {
    if (userId === null || keyKnown) return;
    let live = true;
    // Through a promise: a failure of any kind (even a missing service method) stays hidden.
    Promise.resolve()
      .then(() => userService.getCurrentUser())
      .then((fresh) => {
        const current = latestUser.current;
        if (live && current && fresh && 'photoKey' in fresh)
          setUser({ ...current, photoKey: fresh.photoKey ?? null });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [userId, keyKnown, setUser]);

  if (!user || !keyKnown) return null;
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;

  const changed = (photoKey: string | null) => {
    setUser({ ...user, photoKey });
    // Teammates' lists carry the key; this person's own screens refresh theirs now: presence, and
    // the cached ticket / thread / users pages (ownPhotoSignal). Assignable users are cleared by
    // the write itself (scopedLookup).
    void queryClient.invalidateQueries({ queryKey: ['presence-members'] });
    ownPhotoChanged();
  };

  /** Shows `next` in the framing dialog (null closes it), freeing the one it replaces (F4). */
  const showPicture = (next: Picture | null) =>
    setPicture((previous) => {
      if (previous && previous !== next) previous.close();
      return next;
    });

  const close = () => {
    showPicture(null);
    setView(CENTRED);
  };

  const choose = (file: File) => {
    if (!ACCEPTED.includes(file.type)) return setError('Use a PNG, JPEG or WebP image');
    if (file.size > MAX_BYTES) return setError('Photo must be 40 MB or smaller');
    setError(null);
    setView(CENTRED);
    openPhoto(file)
      .then(showPicture)
      .catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : 'Couldn’t open that photo')
      );
  };

  const save = async () => {
    if (!picture) return;
    setBusy(true);
    try {
      const key = await userService.uploadPhoto(await cropPhoto(picture, view));
      changed(key);
      close();
    } catch (failure) {
      setError(serverCopy(failure) ?? apiErrorMessage(failure, 'Couldn’t save your photo'));
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
      setError(serverCopy(failure) ?? apiErrorMessage(failure, 'Couldn’t remove your photo'));
    } finally {
      setBusy(false);
    }
  };

  const moveTo = (next: PhotoView) => setView(picture ? clampView(picture, next) : next);
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
          <FilePicker
            accept={ACCEPTED.join(',')}
            label="Choose a profile photo"
            onPick={choose}
            disabled={busy}
          >
            <Camera className="w-4 h-4" />
            {user.photoKey ? 'Change photo' : 'Upload photo'}
          </FilePicker>
          {user.photoKey && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="w-4 h-4" />
              Remove photo
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPEG or WebP. Teammates in your workspaces see it.
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <Dialog open={picture !== null} onOpenChange={(open) => !open && close()}>
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
              <canvas
                ref={previewCanvas}
                role="img"
                aria-label="Your new profile photo"
                width={PREVIEW_PX}
                height={PREVIEW_PX}
                className="block w-full h-full"
              />
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
            <p className="text-xs text-muted-foreground">
              Drag to move. The circle is what teammates see.
            </p>
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
