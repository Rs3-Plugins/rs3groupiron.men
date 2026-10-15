import type { InputHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SITE_NAME } from '../lib/constants';

/** Back link and brand line above a login/create card. */
export function AuthHeader() {
  return (
    <>
      <Link className="hero-back" to="/">
        ← Home
      </Link>
      <span className="hero-brand">{SITE_NAME}</span>
    </>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <span className="hero-error" role="alert">
      {children}
    </span>
  );
}

type CountedFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'maxLength'
> & {
  label: ReactNode;
  value: string;
  max: number;
  onChange: (value: string) => void;
  className?: string;
  /** Replaces the counter, e.g. with a show/hide button. */
  trailing?: ReactNode;
};

/** A labelled input with the characters-used count inside its right edge. */
export function CountedField({
  label,
  value,
  max,
  onChange,
  className,
  trailing,
  ...rest
}: CountedFieldProps) {
  return (
    <label className={['hero-field', className].filter(Boolean).join(' ')}>
      {label}
      <span className="hero-input">
        <input
          value={value}
          maxLength={max}
          onChange={(e) => onChange(e.target.value.slice(0, max))}
          {...rest}
        />
        {trailing ?? (
          <span className="hero-count">
            {value.trim().length}/{max}
          </span>
        )}
      </span>
    </label>
  );
}
