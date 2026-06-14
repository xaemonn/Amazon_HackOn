import { Outlet, Link } from 'react-router-dom';
import './Layout.css';

export function Layout() {
  return (
    <div className="layout">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <header className="site-header">
        <nav className="nav-container" aria-label="Main navigation">
          <Link to="/" className="nav-logo" aria-label="Second Life Commerce home">
            <span className="logo-icon" aria-hidden="true">♻️</span>
            <span className="logo-text">Second Life Commerce</span>
          </Link>

          <ul className="nav-links" role="list">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/orders/order-item-001">Orders</Link></li>
          </ul>
        </nav>
      </header>

      <main id="main-content" className="main-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-container">
          <p>&copy; {new Date().getFullYear()} Second Life Commerce. Zero-Touch Returns Platform.</p>
          <p className="footer-tagline">Giving products a second life, sustainably.</p>
        </div>
      </footer>
    </div>
  );
}
