import type { ReactNode } from 'react';

export type SegmentedOption<T extends string> = {
  id: T;
  label: ReactNode;
  count?: number;
  title?: string;
};

type SegmentedProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={className ? `gms-seg-group ${className}` : 'gms-seg-group'}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            className={active ? 'gms-seg gms-seg--active' : 'gms-seg'}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
            {opt.count !== undefined && <span className="gms-seg-count">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
