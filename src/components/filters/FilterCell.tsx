/**
 * One labelled control in a filters grid.
 *
 * Lifted out of MessageFilters and TicketFilters, which had grown byte-identical
 * copies (down to the Tailwind classes, in a different order). Shared so a new
 * filter can be its own component instead of another block inside an already
 * oversized file.
 */
export function FilterCell({
  label,
  icon,
  children,
  inline = false,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Put the label BESIDE the control instead of above it. A stacked cell costs
   *  ~52px of height; inline costs the control's 32px. On a panel with a dozen
   *  filters that difference is the whole list falling below the fold. */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div className="inline-flex gap-1.5 items-center min-w-0">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="text-[11px] font-medium whitespace-nowrap text-muted-foreground shrink-0">
          {label}
        </span>
        <div className="min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex gap-1 items-center">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="text-xs font-medium truncate text-muted-foreground">{label}</span>
      </div>
      <div className="w-full">{children}</div>
    </div>
  );
}
