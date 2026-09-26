export type SelectOption = { value: string; label: string };

type SelectFieldProps<T extends string> = {
  label: string;
  value: T;
  options: ReadonlyArray<SelectOption>;
  onChange: (value: T) => void;
};

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  return (
    <label className="gms-panel-field">
      <span className="gms-panel-field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
