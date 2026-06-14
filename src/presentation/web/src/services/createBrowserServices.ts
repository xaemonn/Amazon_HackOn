/**
 * createBrowserServices — creates browser-compatible service instances that
 * communicate with the backend API. These are created once at app startup
 * and reused across all navigations (Requirement 6.13).
 *
 * This function is the browser-side "composition root" — it instantiates
 * service instances that the frontend pages consume via ServiceContext.
 *
 * For the unified frontend, services call the Express backend API endpoints
 * rather than running domain logic in the browser. This keeps the frontend
 * thin and delegates business logic to the server composition root.
 */

import type { ServiceContextValue } from '../contexts/ServiceContext';
import type { CatalogService } from '@application/catalog/CatalogService';
import type { IOrdersService } from '@application/ordering/OrdersService';
import type { IReturnsFacade } from '@application/returns/index';
import type { ICartService } from '@application/cart/CartService';
import type { ICheckoutService } from '@application/cart/CheckoutService';
import type { IEventBus, DomainEvent, EventHandler } from '@domain/shared/events';

// ─── Browser Event Bus (client-side pub/sub for UI reactivity) ───────────────

class BrowserEventBus implements IEventBus {
  private handlers = new Map<string, EventHandler[]>();

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) ?? [];
    await Promise.allSettled(handlers.map((h) => h(event)));
  }

  subscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, existing.filter((h) => h !== handler));
  }
}

// ─── API Proxy Stubs ─────────────────────────────────────────────────────────
// These are thin API-calling stubs that satisfy the interface contracts.
// Full implementations will be connected to the Express API endpoints.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Creates the singleton service instances for the browser.
 * Called once at startup — never re-instantiated on navigation.
 */
export function createBrowserServices(): ServiceContextValue {
  const eventBus: IEventBus = new BrowserEventBus();

  // Placeholder service stubs — these will be replaced with full API-calling
  // implementations as page features are connected. For now they satisfy the
  // ServiceContext interface contract.

  const catalogService = {
    getProductById: async (id: string) => {
      const res = await fetch(`${API_BASE}/api/catalog/products/${id}`);
      if (!res.ok) return null;
      return res.json();
    },
    getCategories: async () => {
      const res = await fetch(`${API_BASE}/api/catalog/categories`);
      if (!res.ok) return [];
      return res.json();
    },
    searchProducts: async (keyword: string) => {
      const res = await fetch(`${API_BASE}/api/catalog/search?q=${encodeURIComponent(keyword)}`);
      if (!res.ok) return { products: [], total: 0 };
      return res.json();
    },
  } as unknown as CatalogService;

  const ordersService = {
    getOrders: async (customerId: string) => {
      const res = await fetch(`${API_BASE}/api/orders?customerId=${customerId}`);
      if (!res.ok) return [];
      return res.json();
    },
    getOrderById: async (orderId: string) => {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}`);
      if (!res.ok) return null;
      return res.json();
    },
  } as unknown as IOrdersService;

  const returnsFacade = {
    checkEligibility: async (customerId: string, orderItemId: string) => {
      const res = await fetch(`${API_BASE}/api/returns/eligibility?customerId=${customerId}&orderItemId=${orderItemId}`);
      if (!res.ok) return { eligible: false, errorMessage: 'Failed to check eligibility' };
      return res.json();
    },
  } as unknown as IReturnsFacade;

  const cartService = {
    getCart: async (customerId: string) => {
      const res = await fetch(`${API_BASE}/api/cart/${customerId}`);
      if (!res.ok) return null;
      return res.json();
    },
  } as unknown as ICartService;

  const checkoutService = {
    validateStock: async () => {
      return { valid: true, items: [] };
    },
  } as unknown as ICheckoutService;

  return {
    catalogService,
    ordersService,
    returnsFacade,
    cartService,
    checkoutService,
    eventBus,
  };
}
