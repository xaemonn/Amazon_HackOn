import './SortSelector.css';

export type SortOption = 'relevance' | 'price_asc' | 'price_desc' | 'rating_desc';

export interface SortSelectorProps {
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating_desc', label: 'Rating: High to Low' },
];

export function SortSelector({ sort, onSortChange }: SortSelectorProps) {
  return (
    <div className="sort-selector">
      <label htmlFor="sort-select" className="sort-selector__label">
        Sort by
      </label>
      <select
        id="sort-select"
        className="sort-selector__select"
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        aria-label="Sort search results"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
