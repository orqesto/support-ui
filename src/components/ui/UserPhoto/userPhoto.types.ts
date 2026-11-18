import type { ReactNode } from 'react';

export type UserPhotoProps = {
  /** From the list that named the person (`photoKey`, `assigneePhotoKey`, `authorPhotoKey`). */
  photoKey: string | null | undefined;
  /** What the circle shows today: the initials. Shown until the photo loads, and if it cannot. */
  children: ReactNode;
  className?: string;
};
