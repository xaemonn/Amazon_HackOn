import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiGetReturnPolicy, type ReturnPolicyDecision } from '../api/client';
import { useProduct } from '../hooks/useProducts';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import './ProductDetailPage.css';

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { addItem, items } = useCart();
  const { user } = useAuth();
  const { product, isLoading, error } = useProduct(productId);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const [returnPolicy, setReturnPolicy] = useState<ReturnPolicyDecision | null>(null);

  const inCart = items.some((i) => i.product.id === productId);

  useEffect(() => {
    setSelectedIndex(0);
    setImgFailed(false);
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
  const discount = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : 0;

  const deliveryDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const images = product.images?.length ? product.images : [];
  const currentImage = images[selectedIndex];

  return (
    <div className="product-detail">
      <nav className="pd-breadcrumb" aria-label="Breadcrumb">
        <Link to="/catalog">Shop</Link>
        <span aria-hidden="true"> › </span>
        <Link to={`/catalog?category=${encodeURIComponent(product.category)}`}>{product.category}</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="pd-layout">
        {/* Left: image gallery */}
        <div className="pd-image-col">
          {/* Thumbnails on the left side */}
          {images.length > 1 && (
            <div className="pd-image-thumbs" aria-label="Product images">
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  className={`pd-image-thumb ${i === selectedIndex ? 'pd-image-thumb--active' : ''}`}
                  onClick={() => { setSelectedIndex(i); setImgFailed(false); }}
                  aria-label={`View image ${i + 1}`}
                >
                  <img src={img} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }} />
                </button>
              ))}
            </div>
          )}

          {/* Main image */}
          <div className="pd-image" aria-label={product.name}>
            {currentImage && !imgFailed ? (
              <img
                src={currentImage}
                alt={product.name}
                className="pd-main-img"
                onError={() => setImgFailed(true)}
              />
            ) : product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="pd-image-img" />
            ) : (
              <span className="pd-emoji-fallback">{product.emoji}</span>
            )}
            {product.badge && <span className="pd-image-badge">{product.badge}</span>}
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
            <span className="pd-rating-text">{product.rating} · {product.reviewCount.toLocaleString('en-IN')} ratings</span>
          </div>

          <div className="pd-price-row">
            <div className="pd-price-group">
              <p className="pd-price">₹{product.price.toLocaleString('en-IN')}</p>
              {product.originalPrice && (
                <div className="pd-price-meta">
                  <span className="pd-original-price">M.R.P: <s>₹{product.originalPrice.toLocaleString('en-IN')}</s></span>
                  {discount > 0 && <span className="pd-discount-badge">Save {discount}%</span>}
                </div>
              )}
            </div>
            <p className="pd-price-label">Inclusive of all taxes</p>
          </div>

          <p className={`pd-stock ${product.inStock ? 'pd-stock--in' : 'pd-stock--out'}`}>
            {product.inStock ? '✓ In Stock' : '✗ Currently unavailable'}
          </p>

          <div className="pd-description-section">
            <p className="pd-description">{product.description}</p>
          </div>

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
          {product.originalPrice && (
            <p className="pd-buy-savings">
              You save: ₹{(product.originalPrice - product.price).toLocaleString('en-IN')} ({discount}%)
            </p>
          )}
          <p className="pd-buy-delivery">
            FREE delivery <strong>{deliveryDate}</strong>
          </p>
          <p className={`pd-stock ${product.inStock ? 'pd-stock--in' : 'pd-stock--out'}`} style={{ marginBottom: '1rem', fontSize: '1.05rem' }}>
            {product.inStock ? '✓ In Stock' : '✗ Currently unavailable'}
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

          <div className="pd-trust-badges">
            <p className="pd-secure">🔒 Secure transaction</p>
            <p className="pd-ships-from">📦 Ships from Second Life Commerce</p>
            <p className="pd-returns-note">♻️ 30-day zero-touch return policy</p>
          </div>
        </div>
      </div>
    </div>
  );
}
