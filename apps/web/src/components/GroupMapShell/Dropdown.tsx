import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { setMenuOpen } from '../../lib/menuState';
import { CaretIcon } from './icons';

export type DropdownOption<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
};

type DropdownProps<T extends string> = {
  options: ReadonlyArray<DropdownOption<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  /** 30px inside the member card, 34px everywhere else. */
  small?: boolean;
  disabled?: boolean;
  /** Shown on hover when disabled, to explain why. */
  title?: string;
  className?: string;
};

export function Dropdown<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  small = false,
  disabled = false,
  title,
  className,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useDismiss(
    open,
    rootRef,
    useCallback((reason) => {
      setOpen(false);
      if (reason === 'escape') buttonRef.current?.focus();
    }, []),
  );

  // Announced globally so hover affordances underneath stay quiet, and
  // released on unmount so a dropdown removed while open cannot leak a count.
  useEffect(() => {
    if (!open || disabled) return;
    setMenuOpen(true);
    return () => setMenuOpen(false);
  }, [open, disabled]);

  const current = options.find((o) => o.id === value) ?? options[0];

  return (
    <div
      className={[
        'gms-dd',
        small ? 'gms-dd--sm' : '',
        open && !disabled ? 'gms-dd--open' : '',
        disabled ? 'gms-dd--disabled' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={rootRef}
    >
      <button
        type="button"
        ref={buttonRef}
        className="gms-dd-btn"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-controls={open && !disabled ? listId : undefined}
        disabled={disabled}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        {current?.icon}
        <span className="gms-dd-label">{current?.label}</span>
        <CaretIcon />
      </button>

      {open && !disabled && (
        <div className="gms-dd-menu" id={listId} role="listbox" aria-label={ariaLabel}>
          {options.map((opt) => {
            const selected = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={opt.disabled}
                title={opt.title}
                className={selected ? 'gms-dd-opt gms-dd-opt--sel' : 'gms-dd-opt'}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
              >
                {opt.icon}
                <span className="gms-dd-opt-label">{opt.label}</span>
                {selected && (
                  <span className="gms-dd-check" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
