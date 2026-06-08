import { useState } from 'react';
import { getTooltipClasses } from './tooltip.styles';
import type { TooltipProps } from './tooltip.types';

export const Tooltip = ({
  content,
  children,
  side = 'top',
  size = 'md',
  delayDuration = 200,
}: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<number | null>(null);

  const handleMouseEnter = () => {
    const id = window.setTimeout(() => {
      setIsVisible(true);
    }, delayDuration);
    setTimeoutId(id);
  };

  const handleMouseLeave = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      setTimeoutId(null);
    }
    setIsVisible(false);
  };

  return (
    <span
      role="presentation"
      className="inline-flex relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}

      {isVisible && content && (
        <span className={getTooltipClasses(side, size)} role="tooltip">
          {content}
        </span>
      )}
    </span>
  );
};
