import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../api/client';
import { useCart } from '../context/CartContext';
import '../pages/CatalogPage.css';

export function StarRating({ rating }: { rating: number }) {
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

export function ProductCard({ product }: { product: Product }) {
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
