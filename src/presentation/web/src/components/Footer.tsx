/**
 * Footer — persistent footer rendered within MainLayout on every page.
 *
 * Requirements: 6.2
 */

import './Footer.css';

export function Footer() {
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer__container">
        <p className="site-footer__copyright">
          &copy; {new Date().getFullYear()} Second Life Commerce. Zero-Touch Returns Platform.
        </p>
        <p className="site-footer__tagline">
          Giving products a second life, sustainably.
        </p>
      </div>
    </footer>
  );
}
