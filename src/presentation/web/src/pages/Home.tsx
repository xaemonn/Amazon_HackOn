import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../hooks/useProducts';
import { ProductCard } from '../components/ProductCard';
import './Home.css';

const CATEGORIES = [
  { label: 'Electronics',     emoji: '💻', path: '/catalog?category=Electronics',           bg: 'linear-gradient(135deg,#1a1f2e,#2d3561)' },
  { label: 'Fashion',         emoji: '👗', path: '/catalog?category=Fashion',               bg: 'linear-gradient(135deg,#2d1f3d,#6b3fa0)' },
  { label: 'Home & Kitchen',  emoji: '🏠', path: '/catalog?category=Home+%26+Kitchen',      bg: 'linear-gradient(135deg,#1f2d1f,#2d6b3f)' },
  { label: 'Fitness',         emoji: '💪', path: '/catalog?category=Fitness',               bg: 'linear-gradient(135deg,#2d1f1f,#a03f3f)' },
  { label: 'Books',           emoji: '📚', path: '/catalog?category=Books',                 bg: 'linear-gradient(135deg,#1f271f,#3d6b45)' },
  { label: 'Accessories',     emoji: '🎒', path: '/catalog?category=Accessories',           bg: 'linear-gradient(135deg,#27201a,#8b5e3c)' },
];

export function Home() {
  const { isAuthenticated, user } = useAuth();
  const { products, isLoading } = useProducts();
  const featured = products.slice(0, 8);

  return (
    <div className="home-page">

      {/* Hero banner */}
      <section className="home-hero" aria-label="Welcome banner">
        <div className="home-hero__text">
          <p className="home-hero__eyebrow">Second Life Commerce</p>
          <h1 className="home-hero__title">
            {isAuthenticated
              ? `Welcome back, ${user?.name?.split(' ')[0]}! 👋`
              : 'Shop Smart.\nReturn Easy.\nLive Sustainably.'}
          </h1>
          <p className="home-hero__sub">
            AI-powered zero-touch returns. Every product gets a second life — shop top brands, discover deals, and return effortlessly.
          </p>
          <div className="home-hero__actions">
            <Link to="/catalog" className="hero-btn hero-btn--primary">🛍️ Shop Now</Link>
            {isAuthenticated
              ? <Link to="/orders" className="hero-btn hero-btn--outline">📦 My Orders</Link>
              : <Link to="/login" className="hero-btn hero-btn--outline">Sign In</Link>
            }
          </div>
        </div>
        <div className="home-hero__visual" aria-hidden="true">
          <div className="home-hero__badge">♻️</div>
          <div className="home-hero__bubbles">
            <span>30-day returns</span>
            <span>Free delivery</span>
            <span>AI grading</span>
            <span>Top brands</span>
          </div>
        </div>
      </section>

      {/* Category grid */}
      <section aria-labelledby="cat-heading">
        <div className="home-section-header">
          <h2 id="cat-heading" className="home-section-title">Shop by Category</h2>
          <Link to="/catalog" className="home-see-all">See all products →</Link>
        </div>
        <div className="home-cat-grid">
          {CATEGORIES.map((c) => (
            <Link key={c.label} to={c.path} className="home-cat-card">
              <span className="home-cat-card__emoji" aria-hidden="true">{c.emoji}</span>
              <span className="home-cat-card__label">{c.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section aria-labelledby="feat-heading">
        <div className="home-section-header">
          <h2 id="feat-heading" className="home-section-title">Featured Today</h2>
          <Link to="/catalog" className="home-see-all">View all →</Link>
        </div>
        {isLoading ? (
          <div className="catalog-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="product-skeleton" aria-hidden="true" />
            ))}
          </div>
        ) : (
          <div className="catalog-grid">
            {featured.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {/* Returns promo */}
      <section className="home-returns-promo" aria-label="Zero-touch returns feature">
        <div className="home-returns-promo__inner">
          <div className="home-returns-promo__icon" aria-hidden="true">📦</div>
          <div className="home-returns-promo__text">
            <h2>Hassle-Free Returns in Under 5 Minutes</h2>
            <p>Take a photo, our AI grades the item instantly, and you get your refund — no packing, no waiting, no queues.</p>
            <ul className="home-returns-bullets">
              <li>✓ AI grades your item in seconds</li>
              <li>✓ Grade A items relisted at discount</li>
              <li>✓ Immediate or scheduled refund</li>
              <li>✓ Zero manual intervention needed</li>
            </ul>
          </div>
          <Link to="/orders" className="hero-btn hero-btn--white">Start a Return</Link>
        </div>
      </section>

      {/* Why us */}
      <section aria-labelledby="why-heading">
        <h2 id="why-heading" className="home-section-title" style={{ marginBottom: '1.25rem' }}>Why Second Life Commerce?</h2>
        <div className="home-why-grid">
          <div className="home-why-card">
            <span className="home-why-card__icon" aria-hidden="true">🚀</span>
            <h3>Instant Processing</h3>
            <p>Returns processed by AI in under 5 minutes — not 24 hours.</p>
          </div>
          <div className="home-why-card">
            <span className="home-why-card__icon" aria-hidden="true">🔒</span>
            <h3>Secure Payments</h3>
            <p>UPI, cards, or cash on delivery. Always your choice.</p>
          </div>
          <div className="home-why-card">
            <span className="home-why-card__icon" aria-hidden="true">♻️</span>
            <h3>Zero Waste</h3>
            <p>Every returned item gets resold, refurbished, or recycled.</p>
          </div>
          <div className="home-why-card">
            <span className="home-why-card__icon" aria-hidden="true">📱</span>
            <h3>Mobile First</h3>
            <p>Designed for your phone. Shop and return from anywhere.</p>
          </div>
        </div>
      </section>

    </div>
  );
}
