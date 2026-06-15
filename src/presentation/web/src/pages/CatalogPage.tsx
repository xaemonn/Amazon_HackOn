import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGetCatalog, type Product } from '../api/client';
import { useCart } from '../context/CartContext';
import './CatalogPage.css';

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="star-rating" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < full ? 'star star--full' : half && i === full ? 'star star--half' : 'star star--empty'}>★</span>
      ))}
      <span className="star-count">({rating})</span>
    </span>
  );
}

function ProductCard({ product }: { product: Product }) {
  const { addItem, items } = useCart();
  const inCart = items.some((i) => i.product.id === product.id);
  const [imgFailed, setImgFailed] = useState(false);
  const mainImage = product.images?.[0];
  const discount = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : 0;

  return (
    <article className="product-card">
      <Link to={`/catalog/${product.id}`} className="product-card__image-link">
        <div className="product-card__image">
          {mainImage && !imgFailed ? (
            <img
              src={mainImage}
              alt={product.name}
              className="product-card__img"
              onError={() => setImgFailed(true)}
              loading="lazy"
            />
          ) : product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="product-card__image-img" loading="lazy" />
          ) : (
            <span className="product-card__emoji">{product.emoji}</span>
          )}
          {product.badge && <span className="product-card__badge">{product.badge}</span>}
          {discount > 0 && <span className="product-card__discount">-{discount}%</span>}
        </div>
      </Link>

      <div className="product-card__body">
        <p className="product-card__category">{product.category}</p>
        <Link to={`/catalog/${product.id}`} className="product-card__name">
          {product.name}
        </Link>
        <StarRating rating={product.rating} />
        <p className="product-card__reviews">{product.reviewCount.toLocaleString('en-IN')} ratings</p>

        <div className="product-card__footer">
          <div className="product-card__price-group">
            <p className="product-card__price">₹{product.price.toLocaleString('en-IN')}</p>
            {product.originalPrice && (
              <p className="product-card__original-price">₹{product.originalPrice.toLocaleString('en-IN')}</p>
            )}
          </div>
          {product.inStock ? (
            <button
              type="button"
              className={`btn-add-cart ${inCart ? 'btn-add-cart--in-cart' : ''}`}
              onClick={() => addItem(product)}
              aria-label={`Add ${product.name} to cart`}
            >
              {inCart ? '✓ In Cart' : 'Add to Cart'}
            </button>
          ) : (
            <span className="product-card__out-of-stock">Out of stock</span>
          )}
        </div>
      </div>
    </article>
  );
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const search = searchParams.get('search') ?? '';
  const category = searchParams.get('category') ?? '';

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiGetCatalog({ search, category });
      setProducts(data.products);
      setCategories(['All', ...data.categories]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products.');
    } finally {
      setIsLoading(false);
    }
  }, [search, category]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

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
