import { Routes, Route } from 'react-router-dom';
import { CatalogProvider } from './CatalogContext';
import { ConnectedHomePage } from './pages/ConnectedHomePage';
import { ConnectedProductDetailPage } from './pages/ConnectedProductDetailPage';
import { ConnectedSearchResultsPage } from './pages/ConnectedSearchResultsPage';
import { CategoryPage } from './pages/CategoryPage';
import { ConnectedGlobalNav } from './ConnectedGlobalNav';

function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ConnectedGlobalNav />
      {children}
    </>
  );
}

export function CatalogRoutes() {
  return (
    <CatalogProvider>
      <CatalogLayout>
        <Routes>
          <Route path="/" element={<ConnectedHomePage />} />
          <Route path="/product/:id" element={<ConnectedProductDetailPage />} />
          <Route path="/search" element={<ConnectedSearchResultsPage />} />
          <Route path="/category/:id" element={<CategoryPage />} />
        </Routes>
      </CatalogLayout>
    </CatalogProvider>
  );
}
