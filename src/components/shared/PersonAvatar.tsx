import type { ReactNode } from 'react';
import { UserPhoto } from '@/components/ui/UserPhoto';
import { cn } from '@/lib/utils';

/**
 * A person's round avatar on the primary colour (Settings → Users, the sidebar): their profile
 * photo when they have one, else the initials the screen passes in. Size via `className`.
 */
export const PersonAvatar = ({
  photoKey,
  className,
  children,
}: {
  photoKey: string | null | undefined;
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={cn(
      'flex shrink-0 justify-center items-center rounded-full overflow-hidden text-sm font-medium bg-primary text-primary-foreground',
      className
    )}
  >
    <UserPhoto photoKey={photoKey}>{children}</UserPhoto>
  </div>
);
