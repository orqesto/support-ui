import { useState, useEffect } from 'react';
import { getTooltipClasses, getTooltipArrowClasses } from './tooltip.styles';
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1280);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
    <div
      className="inline-flex relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {isVisible && content && isMobile && (
        <div className={getTooltipClasses(side, size)} role="tooltip">
          {content}
          <div className={getTooltipArrowClasses(side)} />
        </div>
      )}
    </div>
  );
};
