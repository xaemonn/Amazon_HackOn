import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './GlobalNav.css';

export interface CategoryLink {
  id: string;
  name: string;
}

export interface GlobalNavProps {
  cartCount?: number;
  categories?: CategoryLink[];
}

export function GlobalNav({ cartCount = 0, categories = [] }: GlobalNavProps) {
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLUListElement>(null);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        categoryMenuRef.current &&
        !categoryMenuRef.current.contains(event.target as Node) &&
        categoryButtonRef.current &&
        !categoryButtonRef.current.contains(event.target as Node)
      ) {
        setCategoryMenuOpen(false);
      }
    }

    if (categoryMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [categoryMenuOpen]);

  // Close menu on Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && categoryMenuOpen) {
        setCategoryMenuOpen(false);
        categoryButtonRef.current?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [categoryMenuOpen]);

  const formattedBadge = cartCount <= 0 ? null : cartCount > 99 ? '99+' : String(cartCount);

  return (
    <nav className="global-nav" aria-label="Global navigation">
      {/* Logo */}
      <Link to="/" className="global-nav__logo" aria-label="Second Life Commerce home">
        <span className="global-nav__logo-icon" aria-hidden="true">♻️</span>
        <span className="global-nav__logo-text">Second Life Commerce</span>
      </Link>

      {/* Search bar placeholder */}
      <div className="global-nav__search">
        <label htmlFor="global-search-input" className="sr-only">
          Search products
        </label>
        <input
          id="global-search-input"
          type="search"
          className="global-nav__search-input"
          placeholder="Search products..."
          maxLength={200}
          aria-label="Search products"
        />
        <button
          type="button"
          className="global-nav__search-btn"
          aria-label="Submit search"
        >
          <svg
            className="global-nav__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>

      {/* Category menu */}
      <div className="global-nav__categories">
        <button
          ref={categoryButtonRef}
          type="button"
          className="global-nav__category-btn"
          aria-expanded={categoryMenuOpen}
          aria-haspopup="true"
          aria-controls="category-menu"
          aria-label="Browse categories"
          onClick={() => setCategoryMenuOpen((prev) => !prev)}
        >
          <svg
            className="global-nav__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          <span className="global-nav__category-label">Categories</span>
        </button>

        {categoryMenuOpen && (
          <ul
            id="category-menu"
            ref={categoryMenuRef}
            className="global-nav__category-dropdown"
            role="menu"
            aria-label="Product categories"
          >
            {categories.length === 0 ? (
              <li className="global-nav__category-item global-nav__category-item--empty" role="menuitem">
                No categories available
              </li>
            ) : (
              categories.map((cat) => (
                <li key={cat.id} className="global-nav__category-item" role="menuitem">
                  <Link
                    to={`/category/${cat.id}`}
                    className="global-nav__category-link"
                    onClick={() => setCategoryMenuOpen(false)}
                  >
                    {cat.name}
                  </Link>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {/* Account icon */}
      <Link to="/account" className="global-nav__account" aria-label="My account">
        <svg
          className="global-nav__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </Link>

      {/* Cart icon with badge */}
      <Link to="/cart" className="global-nav__cart" aria-label={`Shopping cart${cartCount > 0 ? `, ${cartCount} item${cartCount === 1 ? '' : 's'}` : ''}`}>
        <svg
          className="global-nav__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        {formattedBadge && (
          <span className="global-nav__cart-badge" aria-hidden="true">
            {formattedBadge}
          </span>
        )}
      </Link>
    </nav>
  );
}
