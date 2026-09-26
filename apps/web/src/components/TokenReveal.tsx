import type { ReactNode } from 'react';
import { useCopy } from '../hooks/useCopy';

type TokenRevealProps = {
  token: string;
  label?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  onCopyError?: (message: string) => void;
  /** Class hooks so the same component can wear gms-* or auth-* styling. */
  classNames: {
    root?: string;
    label: string;
    row: string;
    code?: string;
    button: string;
    hint?: string;
  };
};

export function TokenReveal({
  token,
  label = 'Group token',
  hint,
  disabled = false,
  onCopyError,
  classNames,
}: TokenRevealProps) {
  const { copied, copy } = useCopy();

  return (
    <div className={classNames.root}>
      <span className={classNames.label}>{label}</span>
      <div className={classNames.row}>
        <code className={classNames.code}>{token}</code>
        <button
          type="button"
          className={classNames.button}
          disabled={disabled}
          onClick={() => {
            void copy(token).then((ok) => {
              if (!ok) onCopyError?.('Could not copy token');
            });
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Token copied to clipboard' : ''}
        </span>
      </div>
      {hint ? <p className={classNames.hint}>{hint}</p> : null}
    </div>
  );
}
