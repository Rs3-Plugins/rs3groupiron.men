import type { InputHTMLAttributes } from 'react';
import { SearchIcon } from './icons';

type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Accessible name; the visible placeholder is just "Search". */
  label: string;
};

/**
 * A search input with the magnifier inside its left edge. Wrapped in a label
 * so clicking the icon focuses the field. Pass `className` to style the
 * input itself; the wrapper is shared.
 */
export function SearchField({ label, placeholder = 'Search', ...rest }: SearchFieldProps) {
  return (
    <label className="gms-search-wrap">
      <SearchIcon className="gms-search-icon" />
      <input type="search" placeholder={placeholder} aria-label={label} {...rest} />
    </label>
  );
}
