import { shiftDay } from '../../lib/day';

type DayPickerProps = {
  day: string;
  today: string;
  onChange: (day: string) => void;
};

export function DayPicker({ day, today, onChange }: DayPickerProps) {
  return (
    <div className="gms-panel-day">
      <button
        type="button"
        className="gms-panel-day-step"
        aria-label="Previous day"
        disabled={!day}
        onClick={() => onChange(shiftDay(day, -1))}
      >
        ‹
      </button>
      <label className="gms-panel-field">
        <span className="gms-panel-field-label">Day</span>
        <input
          type="date"
          value={day}
          max={today}
          aria-label="Filter by day"
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="gms-panel-day-step"
        aria-label="Next day"
        disabled={!day || day >= today}
        onClick={() => onChange(shiftDay(day, 1))}
      >
        ›
      </button>
      <button
        type="button"
        className="gms-panel-day-all"
        aria-pressed={day === ''}
        onClick={() => onChange(day ? '' : today)}
      >
        {day ? 'All time' : 'Today'}
      </button>
    </div>
  );
}

export function ShowAllTimeButton({ onClick }: { onClick: () => void }) {
  return (
    <>
      {' · '}
      <button type="button" className="gms-panel-inline-btn" onClick={onClick}>
        Show all time
      </button>
    </>
  );
}
