import { Link } from 'react-router-dom';
import './ProductCard.css';

export interface ProductCardData {
  id: string;
  title: string;
  brand: string;
  thumbnailUrl: string;
  lowestPrice: number;
  averageRating: number | null;
  reviewCount: number;
  isOutOfStock: boolean;
  hasSecondLife: boolean;
}

export interface ProductCardProps {
  product: ProductCardData;
}

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

export function ProductCard({ product }: ProductCardProps) {
  const formattedPrice = `₹${product.lowestPrice.toLocaleString('en-IN')}`;

  return (
    <article className="product-card" aria-label={`${product.title} by ${product.brand}`}>
      <Link
        to={`/product/${product.id}`}
        className="product-card__link"
        aria-label={`View ${product.title}`}
      >
        <div className="product-card__image-container">
          <img
            src={product.thumbnailUrl}
            alt={product.title}
            className="product-card__image"
            loading="lazy"
          />
          {product.isOutOfStock && (
            <span className="product-card__badge product-card__badge--out-of-stock" aria-label="Out of Stock">
              Out of Stock
            </span>
          )}
          {product.hasSecondLife && !product.isOutOfStock && (
            <span className="product-card__badge product-card__badge--second-life" aria-label="Second Life item">
              Second Life
            </span>
          )}
        </div>
        <div className="product-card__details">
          <h3 className="product-card__title">{product.title}</h3>
          <p className="product-card__brand">{product.brand}</p>
          <p className="product-card__price">{formattedPrice}</p>
          <div className="product-card__rating" aria-label={
            product.averageRating !== null
              ? `${product.averageRating.toFixed(1)} out of 5 stars, ${product.reviewCount} reviews`
              : 'No ratings yet'
          }>
            {product.averageRating !== null ? (
              <>
                <span className="product-card__stars" aria-hidden="true">
                  {renderStars(product.averageRating)}
                </span>
                <span className="product-card__review-count">
                  ({product.reviewCount})
                </span>
              </>
            ) : (
              <span className="product-card__no-rating">No ratings yet</span>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
