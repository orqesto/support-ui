/**
 * One row of a source's overflow menu.
 *
 * The markup was repeated verbatim for every entry, which is how the card ended up
 * against its line budget: adding a single menu action cost eleven lines of
 * boilerplate before any behaviour. One component instead, so a new action is a
 * name, an icon and a handler.
 */

import type { ComponentType } from 'react';
import { Button } from '@/components/ui/Button';

export const SourceMenuItem = ({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) => (
  <Button
    variant="ghost"
    className="flex justify-start items-center px-3 py-2 w-full h-auto text-sm hover:bg-accent"
    onClick={onClick}
  >
    <Icon className="mr-2 w-4 h-4" />
    {label}
  </Button>
);
