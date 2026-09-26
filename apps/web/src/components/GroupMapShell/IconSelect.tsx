import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useDismiss } from '../../hooks/useDismiss';

export type IconOption = {
  value: string;
  label: string;
  icon?: ReactNode;
};

type IconSelectProps = {
  label: string;
  value: string;
  options: ReadonlyArray<IconOption>;
  onChange: (value: string) => void;
  className?: string;
  hideLabel?: boolean;
};

export function IconSelect({
  label,
  value,
  options,
  onChange,
  className,
  hideLabel = false,
}: IconSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const id = useId();

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[selectedIndex];

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useDismiss(
    open,
    rootRef,
    useCallback((reason) => close(reason === 'escape'), [close]),
  );

  useEffect(() => {
    if (!open) return;
    setActive(selectedIndex);
    listRef.current?.focus();
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    close(true);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    const last = options.length - 1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : last);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
      return;
    }
    if (e.key === 'Tab') {
      close(false);
      return;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      typed.current.text = now - typed.current.at > 1000 ? e.key : typed.current.text + e.key;
      typed.current.at = now;
      const prefix = typed.current.text.toLowerCase();
      const found = options.findIndex((o) => o.label.toLowerCase().startsWith(prefix));
      if (found >= 0) setActive(found);
    }
  }

  return (
    <div className="gms-panel-field gms-iconselect" ref={rootRef}>
      <span className={hideLabel ? 'sr-only' : 'gms-panel-field-label'} id={`${id}-label`}>
        {label}
      </span>

      <button
        type="button"
        ref={triggerRef}
        className={['gms-iconselect-trigger', className].filter(Boolean).join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {selected?.icon}
        <span className="gms-iconselect-value" id={`${id}-value`}>
          {selected?.label ?? ''}
        </span>
        <span className="gms-iconselect-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <ul
          className="gms-iconselect-list"
          role="listbox"
          ref={listRef}
          tabIndex={-1}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-opt-${index}`}
              data-index={index}
              role="option"
              aria-selected={option.value === value}
              className={[
                'gms-iconselect-option',
                index === active ? 'gms-iconselect-option--active' : '',
                option.value === value ? 'gms-iconselect-option--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              {option.icon}
              <span className="gms-iconselect-option-label">{option.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
