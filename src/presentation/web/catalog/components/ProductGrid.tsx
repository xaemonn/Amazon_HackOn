import { ProductCard } from './ProductCard';
import type { ProductCardData } from './ProductCard';
import './ProductGrid.css';

export interface ProductGridProps {
  products: ProductCardData[];
}

export function ProductGrid({ products }: ProductGridProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="product-grid" aria-label="Search results">
      <ul className="product-grid__list" role="list">
        {products.map((product) => (
          <li key={product.id} className="product-grid__item">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}
