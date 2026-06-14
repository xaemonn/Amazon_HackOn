/**
 * ServiceContext — provides shared service instances from the composition root
 * to all page components. Services are created once and reused across navigations.
 *
 * Page components access services via the `useServices()` hook, never by importing
 * service classes directly.
 *
 * Requirements: 6.13
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { CatalogService } from '@application/catalog/CatalogService';
import type { IOrdersService } from '@application/ordering/OrdersService';
import type { IReturnsFacade } from '@application/returns/index';
import type { ICartService } from '@application/cart/CartService';
import type { ICheckoutService } from '@application/cart/CheckoutService';
import type { IEventBus } from '@domain/shared/events';

// ─── Context Value ───────────────────────────────────────────────────────────

export interface ServiceContextValue {
  catalogService: CatalogService;
  ordersService: IOrdersService;
  returnsFacade: IReturnsFacade;
  cartService: ICartService;
  checkoutService: ICheckoutService;
  eventBus: IEventBus;
}

// ─── Context ─────────────────────────────────────────────────────────────────

export const ServiceContext = createContext<ServiceContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

interface ServiceProviderProps {
  services: ServiceContextValue;
  children: ReactNode;
}

export function ServiceProvider({ services, children }: ServiceProviderProps) {
  return (
    <ServiceContext.Provider value={services}>
      {children}
    </ServiceContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Access the shared service instances. Must be used within a ServiceProvider.
 * Throws if called outside the provider tree.
 */
export function useServices(): ServiceContextValue {
  const context = useContext(ServiceContext);
  if (!context) {
    throw new Error(
      'useServices must be used within a ServiceProvider. ' +
      'Ensure the App component wraps your tree with ServiceProvider.',
    );
  }
  return context;
}
