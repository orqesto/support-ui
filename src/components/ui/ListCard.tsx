import type { ReactNode } from 'react';
import { Card, CardContent } from './Card';

type ListCardProps = {
  header?: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
};

export const ListCard = ({
  header,
  content,
  footer,
  metadata,
  actions,
  onClick,
}: ListCardProps) => (
  <Card className="overflow-hidden transition-shadow hover:shadow-md" onClick={onClick}>
    <CardContent className="p-4">
      <div className="space-y-3 min-w-0">
        {/* Header Section (badges, status, etc) */}
        {header && <div className="flex flex-wrap gap-2 items-center min-w-0">{header}</div>}

        {/* Main Content Section */}
        <div className="overflow-hidden space-y-2">{content}</div>

        {/* Custom Footer (if provided) */}
        {footer}

        {/* Default Footer with Metadata and Actions */}
        {(metadata ?? actions) && (
          <div className="flex flex-col gap-3 pt-2 min-w-0 border-t">
            {metadata && (
              <div className="flex flex-wrap gap-2 items-center min-w-0 text-xs text-muted-foreground">
                {metadata}
              </div>
            )}
            {actions && (
              <div className="flex flex-wrap gap-2 justify-end items-center min-w-0">{actions}</div>
            )}
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);
