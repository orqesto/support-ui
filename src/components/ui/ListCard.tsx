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
  <Card className="transition-shadow hover:shadow-md overflow-hidden" onClick={onClick}>
    <CardContent className="p-4">
      <div className="space-y-3 min-w-0">
        {/* Header Section (badges, status, etc) */}
        {header && <div className="flex flex-wrap gap-2 items-center min-w-0">{header}</div>}

        {/* Main Content Section */}
        <div className="overflow-hidden space-y-2">{content}</div>

        {/* Custom Footer (if provided) */}
        {footer}

        {/* Default Footer with Metadata and Actions */}
        {(metadata || actions) && (
          <div className="flex flex-col gap-3 pt-2 border-t min-w-0">
            {metadata && (
              <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground min-w-0">
                {metadata}
              </div>
            )}
            {actions && (
              <div className="flex flex-wrap gap-2 items-center justify-end min-w-0">{actions}</div>
            )}
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);
