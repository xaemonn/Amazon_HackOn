import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createBrowserServices } from './services/createBrowserServices';
import './index.css';

// Create service instances once at startup — reused across all navigations (Requirement 6.13)
const services = createBrowserServices();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);
