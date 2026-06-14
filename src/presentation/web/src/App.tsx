/**
 * Unified React App — the single entry point for the Second Life Commerce frontend.
 *
 * Responsibilities:
 * - Provides shared service instances via ServiceContext (created once, reused across navigations)
 * - Uses React Router v6 nested routes with MainLayout for persistent GlobalNav/Footer
 * - Mounts all application routes per the integration-wiring design
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 6.14, 6.15
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ServiceProvider, type ServiceContextValue } from './contexts/ServiceContext';
import { AuthProvider } from './contexts/AuthContext';
import { MainLayout } from './components/MainLayout';

// ─── Page imports ────────────────────────────────────────────────────────────

import { Home } from './pages/Home';
import { ProductDetail } from './pages/ProductDetail';
import { Search } from './pages/Search';
import { Category } from './pages/Category';
import { Account } from './pages/Account';
import { OrdersListPage } from './pages/OrdersListPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { ReturnsFlow } from './pages/ReturnsFlow';
import { CartPage } from './pages/checkout/CartPage';
import { Checkout } from './pages/Checkout';
import { NotFound } from './pages/NotFound';

import './App.css';

// ─── App Props ───────────────────────────────────────────────────────────────

export interface AppProps {
  /**
   * Shared service instances sourced from the composition root.
   * Created once at startup and passed in — never re-instantiated on navigation.
   */
  services: ServiceContextValue;
}

// ─── App Component ───────────────────────────────────────────────────────────

export function App({ services }: AppProps) {
  return (
    <BrowserRouter>
      <ServiceProvider services={services}>
        <AuthProvider>
          <Routes>
            {/* All routes within MainLayout share persistent GlobalNav + Footer */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/search" element={<Search />} />
              <Route path="/category/:id" element={<Category />} />
              <Route path="/account" element={<Account />} />
              <Route path="/orders" element={<OrdersListPage />} />
              <Route path="/orders/:id" element={<OrderDetailPage />} />
              <Route path="/returns/:orderId/:itemId" element={<ReturnsFlow />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ServiceProvider>
    </BrowserRouter>
  );
}

export default App;
