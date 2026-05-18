type SpinnerProps = {
  size?: number;
  className?: string;
};

export const Spinner = ({ size = 14, className = 'text-muted-foreground' }: SpinnerProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={`animate-spin ${className}`}
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="14 14" strokeLinecap="round" />
  </svg>
);
