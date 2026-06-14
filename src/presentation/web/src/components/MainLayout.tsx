/**
 * MainLayout — persistent layout component wrapping all application routes.
 * Renders GlobalNav at the top, page content via <Outlet>, and Footer at the bottom.
 *
 * Uses React Router's nested route pattern so GlobalNav and Footer persist
 * across navigations without unmounting/remounting.
 *
 * Requirements: 6.1, 6.2, 6.15
 */

import { Outlet } from 'react-router-dom';
import { GlobalNav } from '../../catalog/components/GlobalNav';
import { Footer } from './Footer';
import './MainLayout.css';

export function MainLayout() {
  return (
    <div className="main-layout">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <GlobalNav cartCount={0} categories={[]} />

      <main id="main-content" className="main-layout__content">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
