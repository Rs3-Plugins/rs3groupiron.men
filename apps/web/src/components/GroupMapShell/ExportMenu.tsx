import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { DownloadIcon, FileTextIcon, ImageIcon, TableIcon } from './icons';

export type ExportFormat = 'csv' | 'xlsx' | 'png';

const FORMATS: Array<{
  value: ExportFormat;
  label: string;
  hint: string;
  icon: ReactNode;
}> = [
  {
    value: 'csv',
    label: 'CSV',
    hint: 'The plotted numbers as comma-separated text',
    icon: <FileTextIcon />,
  },
  {
    value: 'xlsx',
    label: 'Excel',
    hint: 'The plotted numbers as an .xlsx workbook',
    icon: <TableIcon />,
  },
  {
    value: 'png',
    label: 'PNG',
    hint: 'A picture of the chart, with its title and legend',
    icon: <ImageIcon />,
  },
];

type ExportMenuProps = {
  busy: ExportFormat | null;
  disabled: boolean;
  onExport: (format: ExportFormat) => void;
};

export function ExportMenu({ busy, disabled, onExport }: ExportMenuProps) {
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
          {FORMATS.map((format) => (
            <button
              key={format.value}
              type="button"
              className="gms-menu-item"
              role="menuitem"
              title={format.hint}
              onClick={() => {
                setOpen(false);
                onExport(format.value);
              }}
            >
              {format.icon}
              {format.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
