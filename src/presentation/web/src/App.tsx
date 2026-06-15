import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { LoginPage } from './pages/LoginPage';
import { CatalogPage } from './pages/CatalogPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CartPage } from './pages/CartPage';
import { OrderHistoryPage } from './pages/OrderHistoryPage';
import { AccountPage } from './pages/AccountPage';
import { OrderDetail } from './pages/OrderDetail';
import { MarketplacePage } from './pages/MarketplacePage';
import { MarketplaceListingDetailPage } from './pages/MarketplaceListingDetailPage';
import { Eligibility } from './pages/returns/Eligibility';
import { ReasonPicker } from './pages/returns/ReasonPicker';
import { MediaCapture } from './pages/returns/MediaCapture';
import { GradingProgress } from './pages/returns/GradingProgress';
import { DispositionResult } from './pages/returns/DispositionResult';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/catalog/:productId" element={<ProductDetailPage />} />
              <Route path="/marketplace" element={<MarketplacePage />} />
              <Route path="/marketplace/:id" element={<MarketplaceListingDetailPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/orders" element={<OrderHistoryPage />} />
              <Route path="/orders/:orderId" element={<OrderDetail />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/returns/eligibility" element={<Eligibility />} />
              <Route path="/returns/reason" element={<ReasonPicker />} />
              <Route path="/returns/media" element={<MediaCapture />} />
              <Route path="/returns/grading" element={<GradingProgress />} />
              <Route path="/returns/result" element={<DispositionResult />} />
            </Route>
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
