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
      className="hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header Section (badges, status, etc) */}
          {header && (
            <div className="flex items-center gap-2 flex-wrap">
              {header}
            </div>
          )}
          
          {/* Main Content Section */}
          <div className="space-y-2">
            {content}
          </div>
          
          {/* Custom Footer (if provided) */}
          {footer}
          
          {/* Default Footer with Metadata and Actions */}
          {(metadata || actions) && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {metadata}
              </div>
              {actions && (
                <div className="flex items-center gap-2">
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
