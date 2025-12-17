type ConfidenceFilterProps = {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  className?: string;
};

export const ConfidenceFilter = ({ value, onChange, className }: ConfidenceFilterProps) => {
  // 0%, 10%, ..., 100%
  const options = Array.from({ length: 11 }, (_, i) => i * 0.1);
  return (
    <div className={`flex flex-col min-w-[160px] ${className ?? ''}`}>
      <label className="text-xs font-semibold mb-1 text-muted-foreground">Confidence</label>
      <select
        className="w-full rounded border px-2 py-1 text-xs"
        value={value === undefined ? '' : value}
        onChange={e => {
          const v = e.target.value;
          onChange(v === '' ? undefined : Number(v));
        }}
      >
        <option value="">Any</option>
        {options.map(opt => (
          <option key={opt} value={opt}>
            {(opt * 100).toFixed(0)}%
          </option>
        ))}
      </select>
    </div>
  );
};
