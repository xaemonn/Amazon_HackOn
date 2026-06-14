import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCatalog } from '../CatalogContext';
import { SearchResultsPage } from './SearchResultsPage';
import type { SearchFilters } from '../components/FilterPanel';
import type { SortOption } from '../components/SortSelector';
import type { ProductCardData } from '../components/ProductCard';
import type { SecondLifeCardData } from '../components/NoResults';

export function ConnectedSearchResultsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const { searchProducts, getSecondLifeItems, ready } = useCatalog();

  const [results, setResults] = useState<ProductCardData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [sort, setSort] = useState<SortOption>('relevance');
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [secondLifeItems, setSecondLifeItems] = useState<SecondLifeCardData[]>([]);
  const [loading, setLoading] = useState(false);

  // Load second-life items for no-results state
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function loadSecondLife() {
      const items = await getSecondLifeItems();
      if (!cancelled) {
        setSecondLifeItems(items);
      }
    }

    loadSecondLife();
    return () => { cancelled = true; };
  }, [ready, getSecondLifeItems]);

  // Run search whenever query, filters, sort, or page change
  const runSearch = useCallback(async () => {
    if (!ready || !query.trim()) {
      setResults([]);
      setTotalCount(0);
      setTotalPages(0);
      return;
    }

    setLoading(true);
    try {
      // First, get all results to compute available brands
      const allResults = await searchProducts(query, {
        sort,
        page: 1,
        pageSize: 200,
      });

      const brands = [...new Set(allResults.products.map((p) => p.brand))].sort();
      setAvailableBrands(brands);

      // Then get paginated+filtered results
      const searchResult = await searchProducts(query, {
        filters: {
          priceMin: filters.priceMin,
          priceMax: filters.priceMax,
          brands: filters.brands,
          minRating: filters.minRating,
          conditions: filters.conditions,
        },
        sort,
        page,
      });

      setResults(
        searchResult.products.map((p) => ({
          id: p.id,
          title: p.title,
          brand: p.brand,
          thumbnailUrl: p.thumbnailUrl,
          lowestPrice: p.lowestPrice,
          averageRating: p.averageRating,
          reviewCount: p.reviewCount,
          isOutOfStock: p.isOutOfStock,
          hasSecondLife: p.hasSecondLife,
        }))
      );
      setTotalCount(searchResult.totalCount);
      setTotalPages(searchResult.totalPages);
    } finally {
      setLoading(false);
    }
  }, [ready, query, filters, sort, page, searchProducts]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  // Reset page to 1 when filters or sort change
  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <SearchResultsPage
      query={query}
      results={results}
      totalCount={totalCount}
      page={page}
      totalPages={totalPages}
      filters={filters}
      sort={sort}
      availableBrands={availableBrands}
      secondLifeItems={secondLifeItems}
      loading={loading}
      onFiltersChange={handleFiltersChange}
      onSortChange={handleSortChange}
      onPageChange={handlePageChange}
    />
  );
}
