import type { InputHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SITE_NAME } from '../lib/constants';

export function AuthHeader() {
  return (
    <>
      <Link className="auth-back" to="/">
        ← Home
      </Link>
      <p className="auth-brand">{SITE_NAME}</p>
    </>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p className="auth-error" role="alert">
      {children}
    </p>
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
};

export function CountedField({
  label,
  value,
  max,
  onChange,
  className,
  ...rest
}: CountedFieldProps) {
  return (
    <label className={['auth-field', className].filter(Boolean).join(' ')}>
      {label}
      <input
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        {...rest}
      />
      <span className="auth-count">
        {value.trim().length}/{max}
      </span>
    </label>
  );
}
