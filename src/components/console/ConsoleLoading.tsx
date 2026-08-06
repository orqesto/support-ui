import { Spinner } from '@/components/ui/Spinner';

/**
 * Shared full-section loading state for every Console* page. Centers the spinner
 * within the console main area instead of pinning a tiny spinner top-left (mirrors
 * ConsolePage.tsx's centered pattern, scoped to the section rather than the viewport).
 */
export const ConsoleLoading = () => (
  <div className="flex justify-center items-center min-h-[60vh]">
    <Spinner size={24} />
  </div>
);
