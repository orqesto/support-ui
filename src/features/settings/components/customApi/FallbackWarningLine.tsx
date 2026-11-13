import { AlertTriangle } from 'lucide-react';

/**
 * 2026-11-13: the backend's `fallbackWarning` — a SAVED fallback that cannot run (no field tagged
 * “Customer’s email”), so agents get the plain skipped card and only the settings can say why.
 * Shown verbatim (it is our own admin-facing sentence, no vendor text). Absent (an older backend),
 * null or blank ⇒ nothing.
 */
export const FallbackWarningLine = ({ warning }: { warning: unknown }) =>
  typeof warning === 'string' && warning.trim() ? (
    <p data-testid="fallback-warning" className="flex gap-1 text-xs text-warning">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
      <span>{warning.trim()}</span>
    </p>
  ) : null;
