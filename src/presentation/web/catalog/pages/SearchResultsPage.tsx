import { FilterPanel } from '../components/FilterPanel';
import { SortSelector } from '../components/SortSelector';
import { ProductGrid } from '../components/ProductGrid';
import { Pagination } from '../components/Pagination';
import { NoResults } from '../components/NoResults';
import type { SearchFilters } from '../components/FilterPanel';
import type { SortOption } from '../components/SortSelector';
import type { ProductCardData } from '../components/ProductCard';
import type { SecondLifeCardData } from '../components/NoResults';
import './SearchResultsPage.css';

export interface SearchResultsPageProps {
  query: string;
  results: ProductCardData[];
  totalCount: number;
  page: number;
  totalPages: number;
  filters: SearchFilters;
  sort: SortOption;
  availableBrands: string[];
  secondLifeItems?: SecondLifeCardData[];
  loading?: boolean;
  onFiltersChange: (filters: SearchFilters) => void;
  onSortChange: (sort: SortOption) => void;
  onPageChange: (page: number) => void;
}

export function SearchResultsPage({
  query,
  results,
  totalCount,
  page,
  totalPages,
  filters,
  sort,
  availableBrands,
  secondLifeItems,
  loading,
  onFiltersChange,
  onSortChange,
  onPageChange,
}: SearchResultsPageProps) {
  // Empty query: prompt user to search
  if (!query || query.trim().length === 0) {
    return (
      <div className="search-results-page">
        <div className="search-results-page__empty-query" role="status">
          <p className="search-results-page__prompt">
            Enter a search term to find products.
          </p>
        </div>
      </div>
    );
  }

  const hasActiveFilters = !!(
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    (filters.brands && filters.brands.length > 0) ||
    filters.minRating !== undefined ||
    (filters.conditions && filters.conditions.length > 0)
  );

  // No results state
  if (results.length === 0 && !loading) {
    return (
      <div className="search-results-page">
        <div className="search-results-page__header">
          <h1 className="search-results-page__title">
            Search results for &lsquo;{query.length > 200 ? query.slice(0, 200) : query}&rsquo;
          </h1>
        </div>
        <NoResults
          query={query}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={() => onFiltersChange({})}
          secondLifeItems={secondLifeItems}
        />
      </div>
    );
  }

  return (
    <div className="search-results-page">
      <div className="search-results-page__header">
        <h1 className="search-results-page__title">
          Search results for &lsquo;{query.length > 200 ? query.slice(0, 200) : query}&rsquo;
        </h1>
        <p className="search-results-page__count" aria-live="polite">
          {totalCount} {totalCount === 1 ? 'result' : 'results'} found
        </p>
      </div>

      <div className="search-results-page__controls">
        <SortSelector sort={sort} onSortChange={onSortChange} />
      </div>

      <div className="search-results-page__layout">
        <FilterPanel
          filters={filters}
          availableBrands={availableBrands}
          onFiltersChange={onFiltersChange}
        />

        <main className="search-results-page__main">
          {loading ? (
            <div className="search-results-page__loading" role="status" aria-live="polite">
              <p>Loading results…</p>
            </div>
          ) : (
            <>
              <ProductGrid products={results} />
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={onPageChange}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
