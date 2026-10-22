/**
 * The app's loading ring — the full-page loader's (`App.tsx` LoadingFallback), for a wait the
 * user should SEE: a page or a whole list loading, not a button or a field (that is `Spinner`).
 */
export const LoadingRing = ({ label, className = '' }: { label?: string; className?: string }) => (
  <div className={`flex flex-col items-center gap-4 ${className}`}>
    <div
      aria-hidden="true"
      className="w-12 h-12 rounded-full border-b-2 animate-spin border-primary"
    />
    {label && <p className="text-muted-foreground">{label}</p>}
  </div>
);
