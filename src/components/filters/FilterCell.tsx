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
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
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
