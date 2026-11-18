import { useState, type ReactNode } from 'react';
import { API_BASE_URL } from '@/lib/config';
import { cn } from '@/lib/utils';

/** The image link for a photo key from a member list (`GET /api/user-photos/:key`). */
export const userPhotoUrl = (photoKey: string): string =>
  `${API_BASE_URL}/api/user-photos/${encodeURIComponent(photoKey)}`;

type Props = {
  /** From the list that named the person (`photoKey`, `assigneePhotoKey`, `authorPhotoKey`). */
  photoKey: string | null | undefined;
  /** What the circle shows today: the initials. Shown with no key or when the image fails. */
  children: ReactNode;
  className?: string;
};

/**
 * A teammate's profile photo, filling the avatar circle it sits in (each screen keeps its own
 * circle: size, colour, border). The API answers 404 for a photo removed since the list was
 * fetched or a teammate who left, so a failed load shows the initials again — never a broken
 * image. The image is decorative: the circle's own label or the name beside it says who it is.
 * Loaded with the session cookie (same site as the app), cached for good by the browser: a key
 * changes on every upload.
 */
export const UserPhoto = ({ photoKey, children, className }: Props) => {
  const [failedKey, setFailedKey] = useState<string | null>(null);
  if (!photoKey || failedKey === photoKey) return <>{children}</>;
  return (
    <img
      src={userPhotoUrl(photoKey)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedKey(photoKey)}
      className={cn('block w-full h-full rounded-full object-cover', className)}
    />
  );
};
