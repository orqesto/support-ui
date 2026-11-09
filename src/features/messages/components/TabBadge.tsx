/**
 * The count pill beside a message-panel tab label. A count of 0 renders nothing.
 */
export const TabBadge = ({ count, active }: { count: number; active: boolean }) =>
  count > 0 ? (
    <span
      className={`inline-grid place-items-center min-w-[15px] h-[15px] px-1 rounded-[5px] font-sans text-[9.5px] tracking-normal ${
        active ? 'bg-primary-muted text-primary' : 'bg-sunken text-muted-foreground'
      }`}
    >
      {count}
    </span>
  ) : null;
