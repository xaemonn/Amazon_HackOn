import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { OrderDetail } from './pages/OrderDetail';
import { Eligibility } from './pages/returns/Eligibility';
import { ReasonPicker } from './pages/returns/ReasonPicker';
import { MediaCapture } from './pages/returns/MediaCapture';
import { GradingProgress } from './pages/returns/GradingProgress';
import { DispositionResult } from './pages/returns/DispositionResult';
import { CatalogRoutes } from '../catalog';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Returns / Orders flow */}
        <Route element={<Layout />}>
          <Route path="/orders/:orderId" element={<OrderDetail />} />
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
  );
}

export default App;
