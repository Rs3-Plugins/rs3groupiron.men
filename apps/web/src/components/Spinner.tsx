type SpinnerProps = {
  label?: string;
  caption?: boolean;
};

export function Spinner({ label = 'Loading…', caption = true }: SpinnerProps) {
  return (
    <div className="gms-spinner" role="status" aria-live="polite">
      <span className="gms-spinner-ring" aria-hidden />
      <span className={caption ? 'gms-spinner-label' : 'sr-only'}>{label}</span>
    </div>
  );
}
