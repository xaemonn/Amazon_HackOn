import { useState } from 'react';
import './FilterPanel.css';

export interface SearchFilters {
  priceMin?: number;
  priceMax?: number;
  brands?: string[];
  minRating?: number;
  conditions?: ('New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New')[];
}

export interface FilterPanelProps {
  filters: SearchFilters;
  availableBrands: string[];
  onFiltersChange: (filters: SearchFilters) => void;
}

const CONDITION_OPTIONS: { value: SearchFilters['conditions'] extends (infer T)[] | undefined ? T : never; label: string }[] = [
  { value: 'New', label: 'New' },
  { value: 'Certified_Renewed', label: 'Certified Renewed' },
  { value: 'Open_Box', label: 'Open Box' },
  { value: 'Used_Like_New', label: 'Used-Like New' },
];

const RATING_OPTIONS = [4, 3, 2, 1];

export function FilterPanel({ filters, availableBrands, onFiltersChange }: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handlePriceMinChange = (value: string) => {
    const num = value === '' ? undefined : Math.max(0, Number(value));
    onFiltersChange({ ...filters, priceMin: num });
  };

  const handlePriceMaxChange = (value: string) => {
    const num = value === '' ? undefined : Math.max(0, Number(value));
    onFiltersChange({ ...filters, priceMax: num });
  };

  const handleBrandToggle = (brand: string) => {
    const current = filters.brands || [];
    const updated = current.includes(brand)
      ? current.filter((b) => b !== brand)
      : [...current, brand];
    onFiltersChange({ ...filters, brands: updated.length > 0 ? updated : undefined });
  };

  const handleRatingChange = (rating: number) => {
    const newRating = filters.minRating === rating ? undefined : rating;
    onFiltersChange({ ...filters, minRating: newRating });
  };

  const handleConditionToggle = (condition: 'New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New') => {
    const current = filters.conditions || [];
    const updated = current.includes(condition)
      ? current.filter((c) => c !== condition)
      : [...current, condition];
    onFiltersChange({ ...filters, conditions: updated.length > 0 ? updated : undefined });
  };

  const hasActiveFilters = !!(
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    (filters.brands && filters.brands.length > 0) ||
    filters.minRating !== undefined ||
    (filters.conditions && filters.conditions.length > 0)
  );

  const handleClearAll = () => {
    onFiltersChange({});
  };

  const filterContent = (
    <div className="filter-panel__content">
      {/* Price Range */}
      <fieldset className="filter-panel__section">
        <legend className="filter-panel__section-title">Price Range</legend>
        <div className="filter-panel__price-inputs">
          <label className="filter-panel__price-label">
            <span className="sr-only">Minimum price</span>
            <input
              type="number"
              className="filter-panel__price-input"
              placeholder="Min ₹"
              min={0}
              value={filters.priceMin ?? ''}
              onChange={(e) => handlePriceMinChange(e.target.value)}
              aria-label="Minimum price"
            />
          </label>
          <span className="filter-panel__price-separator" aria-hidden="true">–</span>
          <label className="filter-panel__price-label">
            <span className="sr-only">Maximum price</span>
            <input
              type="number"
              className="filter-panel__price-input"
              placeholder="Max ₹"
              min={0}
              value={filters.priceMax ?? ''}
              onChange={(e) => handlePriceMaxChange(e.target.value)}
              aria-label="Maximum price"
            />
          </label>
        </div>
      </fieldset>

      {/* Brand Filter */}
      {availableBrands.length > 0 && (
        <fieldset className="filter-panel__section">
          <legend className="filter-panel__section-title">Brand</legend>
          <div className="filter-panel__checkbox-group" role="group" aria-label="Filter by brand">
            {availableBrands.map((brand) => (
              <label key={brand} className="filter-panel__checkbox-label">
                <input
                  type="checkbox"
                  className="filter-panel__checkbox"
                  checked={filters.brands?.includes(brand) ?? false}
                  onChange={() => handleBrandToggle(brand)}
                  aria-label={`Filter by brand: ${brand}`}
                />
                <span className="filter-panel__checkbox-text">{brand}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Min Rating */}
      <fieldset className="filter-panel__section">
        <legend className="filter-panel__section-title">Minimum Rating</legend>
        <div className="filter-panel__rating-group" role="radiogroup" aria-label="Filter by minimum rating">
          {RATING_OPTIONS.map((rating) => (
            <label key={rating} className="filter-panel__rating-label">
              <input
                type="radio"
                className="filter-panel__radio"
                name="minRating"
                checked={filters.minRating === rating}
                onChange={() => handleRatingChange(rating)}
                aria-label={`${rating} stars and up`}
              />
              <span className="filter-panel__rating-stars" aria-hidden="true">
                {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
              </span>
              <span className="filter-panel__rating-text">& Up</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Condition Filter */}
      <fieldset className="filter-panel__section">
        <legend className="filter-panel__section-title">Condition</legend>
        <div className="filter-panel__checkbox-group" role="group" aria-label="Filter by condition">
          {CONDITION_OPTIONS.map((option) => (
            <label key={option.value} className="filter-panel__checkbox-label">
              <input
                type="checkbox"
                className="filter-panel__checkbox"
                checked={filters.conditions?.includes(option.value) ?? false}
                onChange={() => handleConditionToggle(option.value)}
                aria-label={`Filter by condition: ${option.label}`}
              />
              <span className="filter-panel__checkbox-text">{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Clear All */}
      {hasActiveFilters && (
        <button
          type="button"
          className="filter-panel__clear-btn"
          onClick={handleClearAll}
          aria-label="Clear all filters"
        >
          Clear All Filters
        </button>
      )}
    </div>
  );

  return (
    <aside className="filter-panel" aria-label="Search filters">
      {/* Mobile toggle */}
      <button
        type="button"
        className="filter-panel__toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="filter-panel-content"
      >
        <span className="filter-panel__toggle-text">
          Filters{hasActiveFilters ? ' (active)' : ''}
        </span>
        <span className="filter-panel__toggle-icon" aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Desktop: always visible; Mobile: toggleable */}
      <div
        id="filter-panel-content"
        className={`filter-panel__body${isOpen ? ' filter-panel__body--open' : ''}`}
      >
        {filterContent}
      </div>
    </aside>
  );
}
