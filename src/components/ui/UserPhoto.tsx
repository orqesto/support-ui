import { useEffect, useRef, useState, type ReactNode } from 'react';
import { API_BASE_URL } from '@/lib/config';
import { cn } from '@/lib/utils';

/** The image link for a photo key from a member list (`GET /api/user-photos/:key`). */
export const userPhotoUrl = (photoKey: string): string =>
  `${API_BASE_URL}/api/user-photos/${encodeURIComponent(photoKey)}`;

/** A failed load is tried once more after this (a passing 401 while the session renews, a 429). */
const RETRY_MS = 30_000;

type Props = {
  /** From the list that named the person (`photoKey`, `assigneePhotoKey`, `authorPhotoKey`). */
  photoKey: string | null | undefined;
  /** What the circle shows today: the initials. Shown until the photo loads, and if it cannot. */
  children: ReactNode;
  className?: string;
};

type Failure = { key: string; tries: number; waiting: boolean };

/**
 * A teammate's profile photo, filling the avatar circle it sits in (each screen keeps its own
 * circle: size, colour, border). The initials stay until the photo has loaded, so the circle never
 * flashes empty. The API answers 404 for a photo removed since the list was fetched or a teammate
 * who left: a failed load shows the initials, is tried once more after RETRY_MS (a passing 401 or
 * 429), then stays on the initials. The image is decorative: the circle's own label or the name
 * beside it says who it is. Loaded with the session cookie (same site as the app) and cached for
 * good by the browser: a key changes on every upload.
 */
export const UserPhoto = ({ photoKey, children, className }: Props) => {
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (retry.current && clearTimeout(retry.current)), []);

  const failed = failure !== null && failure.key === photoKey && failure.waiting;
  if (!photoKey || failed) return <>{children}</>;

  const onError = () => {
    const tries = failure?.key === photoKey ? failure.tries + 1 : 1;
    setFailure({ key: photoKey, tries, waiting: true });
    if (tries > 1) return;
    retry.current = setTimeout(
      () => setFailure({ key: photoKey, tries, waiting: false }),
      RETRY_MS
    );
  };

  const loaded = loadedKey === photoKey;
  return (
    <>
      {!loaded && children}
      <img
        src={userPhotoUrl(photoKey)}
        alt=""
        decoding="async"
        draggable={false}
        hidden={!loaded}
        onLoad={() => setLoadedKey(photoKey)}
        onError={onError}
        className={cn('block w-full h-full rounded-full object-cover', className)}
      />
    </>
  );
};
