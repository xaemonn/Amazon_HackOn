/**
 * Search — placeholder page for search results.
 * Will be connected to CatalogService.searchProducts via ServiceContext.
 *
 * Requirements: 6.5
 */

import { useSearchParams } from 'react-router-dom';

export function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';

  return (
    <section aria-labelledby="search-heading">
      <h1 id="search-heading">Search Results</h1>
      {query && <p>Showing results for: <strong>{query}</strong></p>}
      {!query && <p>Enter a search term to find products.</p>}
    </section>
  );
}
