import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useCatalog } from '../CatalogContext';
import { ProductGrid } from '../components/ProductGrid';
import type { ProductCardData } from '../components/ProductCard';
import './CategoryPage.css';

export function CategoryPage() {
  const { id } = useParams<{ id: string }>();
  const { searchProducts, getCategories, ready } = useCatalog();

  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !id) return;
    let cancelled = false;

    async function loadCategory() {
      setLoading(true);
      try {
        // Get category name
        const categories = await getCategories();
        const cat = categories.find((c) => c.id === id);
        if (!cancelled && cat) {
          setCategoryName(cat.name);
        }

        // Search products by category name (the search matches on category)
        if (cat) {
          const result = await searchProducts(cat.name, { pageSize: 50 });
          if (!cancelled) {
            setProducts(
              result.products.map((p) => ({
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
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCategory();
    return () => { cancelled = true; };
  }, [ready, id, searchProducts, getCategories]);

  if (loading) {
    return (
      <div className="category-page" aria-busy="true">
        <div className="category-page__loading" role="status">
          <p>Loading category…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="category-page">
      <header className="category-page__header">
        <h1 className="category-page__title">{categoryName || 'Category'}</h1>
        <p className="category-page__count">
          {products.length} {products.length === 1 ? 'product' : 'products'}
        </p>
      </header>
      <main className="category-page__content">
        {products.length > 0 ? (
          <ProductGrid products={products} />
        ) : (
          <p className="category-page__empty">No products found in this category.</p>
        )}
      </main>
    </div>
  );
}
