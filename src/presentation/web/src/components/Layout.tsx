import { useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import './Layout.css';

export function Layout() {
  const { isAuthenticated, user, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchRef.current?.value.trim();
    navigate(q ? `/catalog?search=${encodeURIComponent(q)}` : '/catalog');
    if (searchRef.current) searchRef.current.value = '';
  };

  const handleLogout = async () => {
    setAccountOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <div className="layout" onClick={() => { setAccountOpen(false); }}>
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* ─── Primary header ─── */}
      <header className="site-header">
        <div className="header-inner">

          {/* Logo */}
          <Link to="/" className="header-logo" aria-label="Second Life Commerce home">
            <span className="header-logo__icon" aria-hidden="true">♻️</span>
            <span className="header-logo__text">
              <span className="header-logo__brand">Second Life</span>
              <span className="header-logo__sub">Commerce</span>
            </span>
          </Link>

          {/* Deliver to (desktop only) */}
          {isAuthenticated && (
            <div className="header-deliver">
              <span className="header-deliver__icon" aria-hidden="true">📍</span>
              <div>
                <span className="header-deliver__label">Deliver to</span>
                <span className="header-deliver__city">
                  {user?.address?.city ?? 'Set address'}
                </span>
              </div>
            </div>
          )}

          {/* Search bar */}
          <form className="header-search" onSubmit={handleSearch} role="search">
            <input
              ref={searchRef}
              type="search"
              className="header-search__input"
              placeholder="Search for products, brands and more"
              aria-label="Search products"
              autoComplete="off"
            />
            <button type="submit" className="header-search__btn" aria-label="Submit search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          </form>

          {/* Account */}
          <div
            className="header-account"
            onClick={(e) => { e.stopPropagation(); setAccountOpen((v) => !v); }}
            role="button"
            tabIndex={0}
            aria-haspopup="true"
            aria-expanded={accountOpen}
            onKeyDown={(e) => e.key === 'Enter' && setAccountOpen((v) => !v)}
          >
            <span className="header-account__greeting">
              {isAuthenticated ? `Hello, ${user?.name?.split(' ')[0]}` : 'Hello, sign in'}
            </span>
            <span className="header-account__label">
              Account &amp; Lists <span aria-hidden="true">▾</span>
            </span>

            {accountOpen && (
              <div className="header-account__dropdown" role="menu" onClick={(e) => e.stopPropagation()}>
                {isAuthenticated ? (
                  <>
                    <Link to="/account" className="dropdown-item" role="menuitem" onClick={() => setAccountOpen(false)}>
                      👤 My Account
                    </Link>
                    <Link to="/orders" className="dropdown-item" role="menuitem" onClick={() => setAccountOpen(false)}>
                      📦 My Orders
                    </Link>
                    <hr className="dropdown-divider" />
                    <button type="button" className="dropdown-item dropdown-item--signout" role="menuitem" onClick={handleLogout}>
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link to="/login" className="dropdown-btn" role="menuitem" onClick={() => setAccountOpen(false)}>
                      Sign In
                    </Link>
                    <p className="dropdown-hint">New customer? <Link to="/login">Start here</Link></p>
                    <hr className="dropdown-divider" />
                    <Link to="/orders" className="dropdown-item" role="menuitem" onClick={() => setAccountOpen(false)}>
                      My Orders
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Returns & Orders */}
          <NavLink to="/orders" className="header-orders" aria-label="Returns and Orders">
            <span className="header-orders__label">Returns</span>
            <span className="header-orders__label">&amp; Orders</span>
          </NavLink>

          {/* Cart */}
          <Link to="/cart" className="header-cart" aria-label={`Cart, ${itemCount} item${itemCount !== 1 ? 's' : ''}`}>
            <span className="header-cart__icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              {itemCount > 0 && (
                <span className="header-cart__badge" aria-hidden="true">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </span>
            <span className="header-cart__label">Cart</span>
          </Link>

          {/* Mobile: hamburger */}
          <button
            type="button"
            className="header-hamburger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          >
            <span /><span /><span />
          </button>
        </div>
      </header>

      {/* ─── Nav strip ─── */}
      <nav className="nav-strip" aria-label="Department navigation">
        <div className="nav-strip__inner">
          <button type="button" className="nav-strip__all" onClick={() => setMenuOpen((v) => !v)}>
            ☰ All
          </button>
          <NavLink to="/catalog" className="nav-strip__link">Shop</NavLink>
          <NavLink to="/marketplace" className="nav-strip__link">♻️ Returns Marketplace</NavLink>
          <NavLink to="/catalog?category=Electronics" className="nav-strip__link">Electronics</NavLink>
          <NavLink to="/catalog?category=Fashion" className="nav-strip__link">Fashion</NavLink>
          <NavLink to="/catalog?category=Home+%26+Kitchen" className="nav-strip__link">Home &amp; Kitchen</NavLink>
          <NavLink to="/orders" className="nav-strip__link">Your Orders</NavLink>
          {isAuthenticated && (
            <NavLink to="/account" className="nav-strip__link">Your Account</NavLink>
          )}
        </div>
      </nav>

      {/* ─── Mobile slide menu ─── */}
      {menuOpen && (
        <div className="mobile-menu" role="dialog" aria-modal="true" aria-label="Navigation menu" onClick={() => setMenuOpen(false)}>
          <div className="mobile-menu__panel" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu__header">
              <span className="mobile-menu__title">
                {isAuthenticated ? `Hello, ${user?.name?.split(' ')[0]}` : 'Hello, sign in'}
              </span>
              <button type="button" className="mobile-menu__close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>✕</button>
            </div>
            <ul className="mobile-menu__list" role="list">
              <li><Link to="/catalog" className="mobile-menu__item" onClick={() => setMenuOpen(false)}>🛍️ Shop All</Link></li>
              <li><Link to="/marketplace" className="mobile-menu__item" onClick={() => setMenuOpen(false)}>♻️ Returns Marketplace</Link></li>
              <li><Link to="/orders" className="mobile-menu__item" onClick={() => setMenuOpen(false)}>📦 My Orders</Link></li>
              <li><Link to="/cart" className="mobile-menu__item" onClick={() => setMenuOpen(false)}>🛒 Cart {itemCount > 0 && `(${itemCount})`}</Link></li>
              {isAuthenticated ? (
                <>
                  <li><Link to="/account" className="mobile-menu__item" onClick={() => setMenuOpen(false)}>👤 My Account</Link></li>
                  <li>
                    <button type="button" className="mobile-menu__item mobile-menu__signout" onClick={handleLogout}>
                      Sign Out
                    </button>
                  </li>
                </>
              ) : (
                <li><Link to="/login" className="mobile-menu__item" onClick={() => setMenuOpen(false)}>Sign In</Link></li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* ─── Main content ─── */}
      <main id="main-content" className="main-content">
        <Outlet />
      </main>

      {/* ─── Footer ─── */}
      <footer className="site-footer">
        <div className="footer-back-to-top">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Back to top
          </button>
        </div>
        <div className="footer-links">
          <div className="footer-col">
            <h4>Get to Know Us</h4>
            <Link to="/">About Second Life Commerce</Link>
            <Link to="/">Sustainability</Link>
          </div>
          <div className="footer-col">
            <h4>Shop With Us</h4>
            <Link to="/catalog">Browse Products</Link>
            <Link to="/cart">Shopping Cart</Link>
          </div>
          <div className="footer-col">
            <h4>Returns</h4>
            <Link to="/orders">Start a Return</Link>
            <Link to="/">Return Policy</Link>
          </div>
          <div className="footer-col">
            <h4>Account</h4>
            <Link to="/account">Your Account</Link>
            <Link to="/orders">Your Orders</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="footer-logo" aria-hidden="true">♻️</span>
          <p>&copy; {new Date().getFullYear()} Second Life Commerce · Zero-Touch Returns</p>
        </div>
      </footer>
    </div>
  );
}
