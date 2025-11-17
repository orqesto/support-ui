import { useState, useEffect, useRef } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

type ScrollButtonsProps = {
  /** CSS selector for the bottom scroll target (optional). If not provided, scrolls to bottom of page/container */
  bottomTarget?: string;
  /** Minimum scroll distance before showing top button (default: 200px) */
  topThreshold?: number;
  /** Minimum scrollable height before showing buttons (default: 10px) */
  scrollThreshold?: number;
};

export const ScrollButtons = ({
  bottomTarget,
  topThreshold = 200,
  scrollThreshold = 10,
}: ScrollButtonsProps) => {
  const location = useLocation();
  const isFullPage =
    location.pathname.includes('/messages/') || location.pathname.includes('/tickets/');

  const [showScrollButtons, setShowScrollButtons] = useState(isFullPage);
  const [showTopButton, setShowTopButton] = useState(false);
  const [showBottomButton, setShowBottomButton] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToTop = () => {
    if (isFullPage) {
      const mainElement = document.querySelector('main');
      if (mainElement) {
        mainElement.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const scrollToBottom = () => {
    if (bottomTarget) {
      // Use custom target if provided
      document.querySelector(bottomTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (isFullPage) {
      // Scroll to bottom of main element
      const mainElement = document.querySelector('main');
      if (mainElement) {
        mainElement.scrollTo({ top: mainElement.scrollHeight, behavior: 'smooth' });
      }
    } else {
      // Scroll to bottom of container
      const container = containerRef.current?.closest(
        '.overflow-auto, .overflow-y-auto'
      ) as HTMLElement;
      container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const checkScroll = () => {
      // Full-page mode - Find the scrollable main element (Layout's main container)
      if (isFullPage) {
        const mainElement = document.querySelector('main');

        if (mainElement) {
          const scrollTop = mainElement.scrollTop;
          const scrollHeight = mainElement.scrollHeight;
          const clientHeight = mainElement.clientHeight;

          console.log('📜 [SCROLL] Main element:', {
            scrollTop,
            scrollHeight,
            clientHeight,
            showUpButton: scrollTop > 50,
            canScroll: scrollHeight > clientHeight,
          });

          // Always show button container in full-page mode
          setShowScrollButtons(true);

          // Top button: show when scrolled down 50px
          setShowTopButton(scrollTop > 50);

          // Bottom button: show when can scroll more
          const maxScroll = scrollHeight - clientHeight;
          setShowBottomButton(scrollTop < maxScroll - 50);

          return;
        }
      }

      // Drawer mode - use container scroll
      const container = containerRef.current?.closest(
        '.overflow-auto, .overflow-y-auto'
      ) as HTMLElement;

      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const isScrollable = scrollHeight > clientHeight + scrollThreshold;

        setShowScrollButtons(isScrollable);
        setShowTopButton(scrollTop > topThreshold);
        setShowBottomButton(scrollTop < scrollHeight - clientHeight - topThreshold);
      }
    };

    checkScroll();

    // Check again after content loads (async attachments, etc.)
    const timeoutId = setTimeout(checkScroll, 1000);

    // Set up event listeners based on mode
    if (isFullPage) {
      // Full-page mode - listen to main element scroll
      const mainElement = document.querySelector('main');
      if (mainElement) {
        mainElement.addEventListener('scroll', checkScroll);
        window.addEventListener('resize', checkScroll);
        return () => {
          clearTimeout(timeoutId);
          mainElement.removeEventListener('scroll', checkScroll);
          window.removeEventListener('resize', checkScroll);
        };
      }
    } else {
      // Drawer mode - listen to container scroll
      const container = containerRef.current?.closest(
        '.overflow-auto, .overflow-y-auto'
      ) as HTMLElement;

      if (container) {
        container.addEventListener('scroll', checkScroll);
        window.addEventListener('resize', checkScroll);
        return () => {
          clearTimeout(timeoutId);
          container.removeEventListener('scroll', checkScroll);
          window.removeEventListener('resize', checkScroll);
        };
      }
    }

    return () => clearTimeout(timeoutId);
  }, [isFullPage, topThreshold, scrollThreshold]);

  if (!showScrollButtons) {
    return <div ref={containerRef} />;
  }

  return (
    <>
      <div ref={containerRef} />
      <div className="flex fixed right-2 bottom-24 z-40 flex-col gap-2">
        {showTopButton && (
          <Button
            onClick={scrollToTop}
            size="sm"
            variant="outline"
            className="p-0 w-10 h-10 border-2 shadow-lg backdrop-blur-sm transition-all duration-300 bg-background/80 hover:scale-110"
            title="Scroll to top"
          >
            <ArrowUp className="w-4 h-4" />
          </Button>
        )}
        {showBottomButton && (
          <Button
            onClick={scrollToBottom}
            size="sm"
            variant="outline"
            className="p-0 w-10 h-10 border-2 shadow-lg backdrop-blur-sm transition-all duration-300 bg-background/80 hover:scale-110"
            title="Scroll to bottom"
          >
            <ArrowDown className="w-4 h-4" />
          </Button>
        )}
      </div>
    </>
  );
};
