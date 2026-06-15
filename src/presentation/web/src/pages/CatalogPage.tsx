import { useSearchParams } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { ProductCard } from '../components/ProductCard';
import './CatalogPage.css';

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const search   = searchParams.get('search')   ?? '';
  const category = searchParams.get('category') ?? '';

  const { products, categories, isLoading, error, reload: fetchProducts } = useProducts(
    { search: search || undefined, category: category || undefined },
  );

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const val = (e.currentTarget.elements.namedItem('search') as HTMLInputElement).value.trim();
    setSearchParams((prev) => {
      if (val) prev.set('search', val); else prev.delete('search');
      return prev;
    });
  };

  const handleCategory = (cat: string) => {
    setSearchParams((prev) => {
      if (cat && cat !== 'All') prev.set('category', cat); else prev.delete('category');
      return prev;
    });
  };

  return (
    <div className="catalog-page">
      <div className="catalog-hero">
        <h1>Shop</h1>
        <form onSubmit={handleSearch} className="catalog-search" role="search">
          <input
            name="search"
            type="search"
            className="catalog-search__input"
            placeholder="Search products…"
            defaultValue={search}
            aria-label="Search products"
          />
          <button type="submit" className="catalog-search__btn">🔍 Search</button>
        </form>
      </div>

      <div className="catalog-layout">
        <aside className="catalog-sidebar" aria-label="Filter by category">
          <p className="catalog-sidebar__label">Department</p>
          <ul className="catalog-sidebar__list" role="list">
            {categories.map((cat) => (
              <li key={cat}>
                <button
                  type="button"
                  className={`catalog-sidebar__item ${(category || 'All') === cat ? 'catalog-sidebar__item--active' : ''}`}
                  onClick={() => handleCategory(cat)}
                >
                  {cat}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="catalog-grid-section" aria-live="polite">
          {isLoading && (
            <div className="catalog-loading" role="status">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="product-skeleton" aria-hidden="true" />
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="catalog-error" role="alert">
              <p>{error}</p>
              <button type="button" className="btn btn-retry" onClick={fetchProducts}>Retry</button>
            </div>
          )}

          {!isLoading && !error && products.length === 0 && (
            <div className="catalog-empty">
              <p>No products found{search ? ` for "${search}"` : ''}.</p>
              <button type="button" className="btn btn-secondary" onClick={() => setSearchParams({})}>
                Clear filters
              </button>
            </div>
          )}

          {!isLoading && !error && products.length > 0 && (
            <>
              <p className="catalog-count">{products.length} result{products.length !== 1 ? 's' : ''}{search ? ` for "${search}"` : ''}{category && category !== 'All' ? ` in ${category}` : ''}</p>
              <div className="catalog-grid">
                {products.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
