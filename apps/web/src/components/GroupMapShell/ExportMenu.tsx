import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { BracesIcon, DownloadIcon, FileTextIcon, ImageIcon, TableIcon } from './icons';

export type ExportFormat = 'csv' | 'json' | 'xlsx' | 'png';

const FORMATS: Record<
  ExportFormat,
  { label: string; hint: string; icon: ReactNode }
> = {
  csv: {
    label: 'CSV',
    hint: 'Comma-separated text, for a spreadsheet',
    icon: <FileTextIcon />,
  },
  json: {
    label: 'JSON',
    hint: 'The raw rows, for scripting',
    icon: <BracesIcon />,
  },
  xlsx: {
    label: 'Excel',
    hint: 'An .xlsx workbook',
    icon: <TableIcon />,
  },
  png: {
    label: 'PNG',
    hint: 'A picture of the chart, with its title and legend',
    icon: <ImageIcon />,
  },
};

const DEFAULT_FORMATS: ExportFormat[] = ['csv', 'xlsx', 'png'];

type ExportMenuProps = {
  busy: ExportFormat | null;
  disabled: boolean;
  /** Which formats this panel can produce. */
  formats?: ReadonlyArray<ExportFormat>;
  onExport: (format: ExportFormat) => void;
};

export function ExportMenu({
  busy,
  disabled,
  formats = DEFAULT_FORMATS,
  onExport,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useDismiss(
    open,
    rootRef,
    useCallback((reason) => {
      setOpen(false);
      if (reason === 'escape') triggerRef.current?.focus();
    }, []),
  );

  return (
    <div className="gms-chart-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={open ? 'gms-graphs-toggle gms-graphs-toggle--active' : 'gms-graphs-toggle'}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy !== null}
        title="Download the chart or the numbers behind it"
        onClick={() => setOpen((v) => !v)}
      >
        <DownloadIcon />
        {busy ? 'Saving…' : 'Export'}
        <span className="gms-menu-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="gms-menu-list" role="menu" aria-label="Export">
          {formats.map((value) => {
            const format = FORMATS[value];
            return (
              <button
                key={value}
                type="button"
                className="gms-menu-item"
                role="menuitem"
                title={format.hint}
                onClick={() => {
                  setOpen(false);
                  onExport(value);
                }}
              >
                {format.icon}
                {format.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
