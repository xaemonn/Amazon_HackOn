import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';
import { LoginPage, SignUpPage } from './pages/LoginPage';
import { OrdersListPage } from './pages/OrdersListPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { AddressBookPage } from './pages/AddressBookPage';
import { PaymentMethodsPage } from './pages/PaymentMethodsPage';
import { NotificationPrefsPage } from './pages/NotificationPrefsPage';
import { Eligibility } from './pages/returns/Eligibility';
import { ReasonPicker } from './pages/returns/ReasonPicker';
import { MediaCapture } from './pages/returns/MediaCapture';
import { GradingProgress } from './pages/returns/GradingProgress';
import { DispositionResult } from './pages/returns/DispositionResult';
import { CatalogRoutes } from '../catalog';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Authentication */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />

        {/* Protected routes within Layout */}
        <Route element={<Layout />}>
          {/* Orders */}
          <Route
            path="/orders"
            element={
              <AuthGuard>
                <OrdersListPage />
              </AuthGuard>
            }
          />
          <Route
            path="/orders/:orderId"
            element={
              <AuthGuard>
                <OrderDetailPage />
              </AuthGuard>
            }
          />

          {/* Account */}
          <Route
            path="/account/profile"
            element={
              <AuthGuard>
                <ProfilePage />
              </AuthGuard>
            }
          />
          <Route
            path="/account/addresses"
            element={
              <AuthGuard>
                <AddressBookPage />
              </AuthGuard>
            }
          />
          <Route
            path="/account/payment-methods"
            element={
              <AuthGuard>
                <PaymentMethodsPage />
              </AuthGuard>
            }
          />
          <Route
            path="/account/notifications"
            element={
              <AuthGuard>
                <NotificationPrefsPage />
              </AuthGuard>
            }
          />

          {/* Returns flow (existing) */}
          <Route path="/returns/eligibility" element={<Eligibility />} />
          <Route path="/returns/reason" element={<ReasonPicker />} />
          <Route path="/returns/media" element={<MediaCapture />} />
          <Route path="/returns/grading" element={<GradingProgress />} />
          <Route path="/returns/result" element={<DispositionResult />} />
        </Route>

        {/* Catalog storefront routes */}
        <Route path="/*" element={<CatalogRoutes />} />
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
