import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiGetProduct, apiGetReturnPolicy, type Product, type ReturnPolicyDecision } from '../api/client';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import './ProductDetailPage.css';

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { addItem, items } = useCart();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [returnPolicy, setReturnPolicy] = useState<ReturnPolicyDecision | null>(null);

  const inCart = items.some((i) => i.product.id === productId);

  useEffect(() => {
    if (!productId) return;
    setIsLoading(true);
    setError(null);
    apiGetProduct(productId)
      .then(setProduct)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load product.'))
      .finally(() => setIsLoading(false));
  }, [productId]);

  // Pre-purchase return-availability check (abuse guard).
  useEffect(() => {
    if (!product || !user) { setReturnPolicy(null); return; }
    apiGetReturnPolicy(user.id, product.price)
      .then(setReturnPolicy)
      .catch(() => setReturnPolicy(null));
  }, [product, user]);

  const handleAddToCart = () => {
    if (!product) return;
    addItem(product);
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2000);
  };

  const handleBuyNow = () => {
    if (!product) return;
    addItem(product);
    navigate('/cart');
  };

  if (isLoading) {
    return (
      <div className="product-detail-skeleton" aria-label="Loading product…">
        <div className="pd-skeleton-image" />
        <div className="pd-skeleton-body">
          <div className="pd-skeleton-line pd-skeleton-line--title" />
          <div className="pd-skeleton-line" />
          <div className="pd-skeleton-line pd-skeleton-line--short" />
          <div className="pd-skeleton-line" />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="product-detail-error" role="alert">
        <p>{error ?? 'Product not found.'}</p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/catalog')}>Back to catalog</button>
      </div>
    );
  }

  const fullStars = Math.floor(product.rating);
  const halfStar = product.rating - fullStars >= 0.5;

  const deliveryDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="product-detail">
      {/* Breadcrumb */}
      <nav className="pd-breadcrumb" aria-label="Breadcrumb">
        <Link to="/catalog">Shop</Link>
        <span aria-hidden="true"> › </span>
        <Link to={`/catalog?category=${encodeURIComponent(product.category)}`}>{product.category}</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="pd-layout">
        {/* Left: image */}
        <div className="pd-image-col">
          <div className="pd-image">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="pd-image-img" />
            ) : (
              <span aria-hidden="true">{product.emoji}</span>
            )}
          </div>
          <div className="pd-image-thumbs" aria-hidden="true">
            {[product.emoji, product.emoji, product.emoji].map((e, i) => (
              <div key={i} className="pd-image-thumb">{e}</div>
            ))}
          </div>
        </div>

        {/* Center: details */}
        <div className="pd-info-col">
          <p className="pd-category">{product.category}</p>
          <h1 className="pd-name">{product.name}</h1>

          <div className="pd-rating">
            <span className="pd-stars" aria-label={`${product.rating} out of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < fullStars ? 'star star--full' : halfStar && i === fullStars ? 'star star--half' : 'star star--empty'}>★</span>
              ))}
            </span>
            <span className="pd-rating-text">{product.rating} · {product.reviewCount.toLocaleString()} ratings</span>
          </div>

          <div className="pd-price-row">
            <p className="pd-price">₹{product.price.toLocaleString('en-IN')}</p>
            <p className="pd-price-label">Inclusive of all taxes</p>
          </div>

          <p className={`pd-stock ${product.inStock ? 'pd-stock--in' : 'pd-stock--out'}`}>
            {product.inStock ? 'In Stock' : 'Currently unavailable'}
          </p>

          <p className="pd-description">{product.description}</p>

          <div className="pd-tags">
            {product.tags.map((tag) => (
              <span key={tag} className="pd-tag">{tag}</span>
            ))}
          </div>

          {returnPolicy && !returnPolicy.returnsAllowed ? (
            <p className="pd-returns-note pd-returns-note--blocked">
              🚫 Returns are not available for this item on your account.
              {returnPolicy.warning ? ` ${returnPolicy.warning}` : ''}
            </p>
          ) : returnPolicy && returnPolicy.riskLevel !== 'none' ? (
            <p className="pd-returns-note pd-returns-note--warn">
              ⚠️ {returnPolicy.warning}
            </p>
          ) : (
            <p className="pd-returns-note">♻️ Eligible for 30-day zero-touch returns</p>
          )}
        </div>

        {/* Right: buy box */}
        <div className="pd-buy-box">
          <p className="pd-buy-price">₹{product.price.toLocaleString('en-IN')}</p>
          <p className="pd-buy-delivery">
            FREE delivery <strong>{deliveryDate}</strong>
          </p>
          <p className={`pd-stock ${product.inStock ? 'pd-stock--in' : 'pd-stock--out'}`} style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>
            {product.inStock ? 'In Stock' : 'Currently unavailable'}
          </p>

          {product.inStock && (
            <div className="pd-actions">
              <button
                type="button"
                className={`pd-btn-cart ${addedFeedback ? 'pd-btn-cart--added' : ''}`}
                onClick={handleAddToCart}
                aria-live="polite"
              >
                {addedFeedback ? '✓ Added to Cart!' : inCart ? 'Add More to Cart' : 'Add to Cart'}
              </button>

              <button type="button" className="pd-btn-buynow" onClick={handleBuyNow}>
                Buy Now
              </button>

              {inCart && (
                <Link to="/cart" className="pd-btn-view-cart">
                  Go to Cart →
                </Link>
              )}
            </div>
          )}

          <p className="pd-secure">🔒 Secure transaction · Ships from Second Life Commerce</p>
          <p className="pd-returns-note">♻️ 30-day zero-touch return policy</p>
        </div>
      </div>
    </div>
  );
}
