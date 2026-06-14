import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useCatalog } from '../CatalogContext';
import { ProductGrid } from '../components/ProductGrid';
import type { ProductCardData } from '../components/ProductCard';
import './CategoryPage.css';

export function CategoryPage() {
  const { id } = useParams<{ id: string }>();
  const { getProductsByCategory, getVariants, getCategories, ready } = useCatalog();

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

        // Get products by category ID directly via facade
        const categoryProducts = await getProductsByCategory(id!);
        if (!cancelled) {
          // Build product cards with variant data for lowest price
          const cards: ProductCardData[] = [];
          for (const product of categoryProducts) {
            const variants = await getVariants(product.id);
            const inStockVariants = variants.filter(v => v.stock > 0);
            const allOutOfStock = inStockVariants.length === 0;
            const pool = allOutOfStock ? variants : inStockVariants;
            const lowestPrice = pool.length > 0
              ? Math.min(...pool.map(v => v.price))
              : product.basePrice;

            cards.push({
              id: product.id,
              title: product.title,
              brand: product.brand,
              thumbnailUrl: product.catalogImageUrl,
              lowestPrice,
              averageRating: product.averageRating ?? null,
              reviewCount: product.reviewCount ?? 0,
              isOutOfStock: allOutOfStock,
              hasSecondLife: variants.some(v => v.sourceReturnId !== undefined),
            });
          }
          setProducts(cards);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCategory();
    return () => { cancelled = true; };
  }, [ready, id, getProductsByCategory, getVariants, getCategories]);

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
