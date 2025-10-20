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
  onClick
}: ListCardProps) => {
  return (
    <Card
      className="transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header Section (badges, status, etc) */}
          {header && (
            <div className="flex flex-wrap gap-2 items-center">
              {header}
            </div>
          )}

          {/* Main Content Section */}
          <div className="overflow-hidden space-y-2">
            {content}
          </div>

          {/* Custom Footer (if provided) */}
          {footer}

          {/* Default Footer with Metadata and Actions */}
          {(metadata || actions) && (
            <div className="flex flex-col gap-3 pt-2 border-t">
              {metadata && (
                <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
                  {metadata}
                </div>
              )}
              {actions && (
                <div className="flex flex-wrap gap-2 items-center justify-end">
                  {actions}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
