/**
 * The count pill (and, for Customer, the availability dot) beside a message-panel tab label.
 * A count of 0 renders nothing; the dot is `role="img"` so a screen reader announces it.
 */
export const TabBadge = ({
  count,
  dot,
  active,
}: {
  count: number;
  dot?: boolean;
  active: boolean;
}) => (
  <>
    {count > 0 && (
      <span
        className={`inline-grid place-items-center min-w-[15px] h-[15px] px-1 rounded-[5px] font-sans text-[9.5px] tracking-normal ${
          active ? 'bg-primary-muted text-primary' : 'bg-sunken text-muted-foreground'
        }`}
      >
        {count}
      </span>
    )}
    {dot && (
      <span
        role="img"
        aria-label="Lookups available"
        className="w-1.5 h-1.5 rounded-full bg-primary"
      />
    )}
  </>
);
