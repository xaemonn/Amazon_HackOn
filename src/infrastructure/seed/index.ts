/**
 * Seed Data Module — demo/dev seed data for the Zero-Touch Returns flow.
 *
 * Exports a `loadSeedData()` function that populates the DI container's
 * services with deterministic demo data:
 *   - A demo customer (Priya Sharma)
 *   - Products with IDs that the MockConditionGrader/MockIdentityVerifier recognize
 *   - Delivered orders owned by the demo customer
 *   - A nearby buyer demand signal (for instant_match routing)
 *
 * Requirements: 16.3, 16.4, 10.3
 */

import type { Customer, OrderItem } from '../../domain/shared/index.js';
import type { DemandSignal } from '../../domain/disposition/RoutingContext.js';
import type { MockAuthService } from '../auth/MockAuthService.js';
import { InMemoryDemandSignalProvider } from './InMemoryDemandSignalProvider.js';

// ─── Seed Constants ──────────────────────────────────────────────────────────

/**
 * Demo customer used across the entire demo flow.
 */
export const DEMO_CUSTOMER: Customer = {
  id: 'customer-001',
  name: 'Priya Sharma',
  email: 'priya@example.com',
};

/**
 * Product definitions with IDs that match the MockConditionGrader's seeded map.
 * Each productId maps to a deterministic grade (A, B, C, D).
 */
export const SEED_PRODUCTS = [
  {
    productId: 'item-grade-a',
    name: 'Premium Wireless Headphones',
    price: 1299,
    currency: 'INR',
    image: '/images/headphones.jpg',
    catalogImageRef: 'catalog/headphones.jpg',
  },
  {
    productId: 'item-grade-b',
    name: 'Bluetooth Speaker',
    price: 799,
    currency: 'INR',
    image: '/images/speaker.jpg',
    catalogImageRef: 'catalog/speaker.jpg',
  },
  {
    productId: 'item-grade-c',
    name: 'Phone Case',
    price: 499,
    currency: 'INR',
    image: '/images/phone-case.jpg',
    catalogImageRef: 'catalog/phone-case.jpg',
  },
  {
    productId: 'item-grade-d',
    name: 'USB Cable',
    price: 199,
    currency: 'INR',
    image: '/images/usb-cable.jpg',
    catalogImageRef: 'catalog/usb-cable.jpg',
  },
] as const;

/**
 * Delivered order items owned by the demo customer.
 * Uses product IDs recognized by the MockConditionGrader for deterministic grading.
 */
export const SEED_ORDER_ITEMS: OrderItem[] = [
  {
    id: 'order-item-001',
    orderId: 'order-001',
    productId: 'item-grade-a',
    customerId: 'customer-001',
    deliveryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    price: 1299,
    currency: 'INR',
    productName: 'Premium Wireless Headphones',
    productImage: '/images/headphones.jpg',
  },
  {
    id: 'order-item-002',
    orderId: 'order-001',
    productId: 'item-grade-b',
    customerId: 'customer-001',
    deliveryDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    price: 799,
    currency: 'INR',
    productName: 'Bluetooth Speaker',
    productImage: '/images/speaker.jpg',
  },
  {
    id: 'order-item-003',
    orderId: 'order-002',
    productId: 'item-grade-c',
    customerId: 'customer-001',
    deliveryDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    price: 499,
    currency: 'INR',
    productName: 'Phone Case',
    productImage: '/images/phone-case.jpg',
  },
  {
    id: 'order-item-004',
    orderId: 'order-002',
    productId: 'item-grade-d',
    customerId: 'customer-001',
    deliveryDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    price: 199,
    currency: 'INR',
    productName: 'USB Cable',
    productImage: '/images/usb-cable.jpg',
  },
];

/**
 * Nearby buyer demand signal — triggers the instant_match disposition path
 * for item-grade-a (Premium Wireless Headphones).
 *
 * Distance of 15km is within the 25km instant-match radius configured in AppConfig.
 */
export const SEED_DEMAND_SIGNAL: { productId: string; signal: DemandSignal } = {
  productId: 'item-grade-a',
  signal: {
    buyerId: 'buyer-001',
    distanceKm: 15,
    matchType: 'active_order',
  },
};

// ─── Load Function ───────────────────────────────────────────────────────────

/**
 * Options for loadSeedData. Accepts the services that need to be populated.
 */
export interface LoadSeedDataOptions {
  /** The MockAuthService instance (has addOrderItem/addCustomer helpers). */
  authService: MockAuthService;
  /** The InMemoryDemandSignalProvider to pre-seed with demand signals. */
  demandSignalProvider: InMemoryDemandSignalProvider;
}

/**
 * Populate the application's services with deterministic demo data.
 *
 * Call this during application startup (after the DI container is wired)
 * to ensure the demo flow has the data it needs.
 */
export function loadSeedData(options: LoadSeedDataOptions): void {
  const { authService, demandSignalProvider } = options;

  // 1. Register order items into the auth service
  //    (The MockAuthService constructor already seeds some items, but we
  //    ensure all four are present with the correct product IDs.)
  for (const orderItem of SEED_ORDER_ITEMS) {
    authService.addOrderItem(orderItem);
  }

  // 2. Register the demand signal for instant-match routing
  demandSignalProvider.addSignal(SEED_DEMAND_SIGNAL.productId, SEED_DEMAND_SIGNAL.signal);

  console.log(
    '[Seed] Loaded demo data: %d order items, %d demand signals',
    SEED_ORDER_ITEMS.length,
    1,
  );
}
