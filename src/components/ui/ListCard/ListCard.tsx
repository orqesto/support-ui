import { Card, CardContent } from '../Card';
import { getListCardClasses, getListCardContentClasses } from './listCard.styles';
import type { ListCardProps } from './listCard.types';

export const ListCard = ({
  header,
  content,
  footer,
  metadata,
  actions,
  onClick,
  hover = true,
  spacing = 'md',
}: ListCardProps) => (
  <Card className={getListCardClasses(hover, spacing)} onClick={onClick}>
    <CardContent padding={spacing}>
      <div className={getListCardContentClasses(spacing)}>
        {header && <div className="flex flex-wrap gap-2 items-center min-w-0">{header}</div>}

        <div className="overflow-hidden space-y-2">{content}</div>

        {footer}

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
