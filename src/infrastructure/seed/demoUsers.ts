/**
 * Demo user + order seeding for the MongoDB-backed auth flow.
 *
 * Two layers:
 *   1. seedDemoUsersAndOrders() — at startup, upserts named demo users
 *      (Prince & Priya) each with their OWN curated order history.
 *   2. ensureStarterOrder() — lazily gives ANY logged-in user (a fresh signup,
 *      etc.) a starter order history the first time they open Orders, so every
 *      account can immediately test the return → grading → resale flow.
 *
 * Orders are written to BOTH stores the app reads from, keyed to the user's real
 * Mongo _id:
 *   - IOrderRepository (ordering domain)  → powers the Order History page
 *   - MockAuthService order items (auth)  → powers return eligibility/grading
 */

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User } from '../auth/MongoUser.js';
import type { IOrderRepository } from '../../domain/ordering/index.js';
import type { Order } from '../../domain/ordering/Order.js';
import type { OrderItem as OrderingOrderItem } from '../../domain/ordering/OrderItem.js';
import type { MockAuthService } from '../auth/MockAuthService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

interface DemoItemSpec {
  productId: string; // must be a grader-recognized id for returns to grade
  name: string;
  price: number;
}

interface DemoUserSpec {
  name: string;
  email: string;
  password: string;
  items: DemoItemSpec[];
}

/** Named demo accounts — log in with these, no signup needed. */
export const DEMO_USERS: DemoUserSpec[] = [
  {
    name: 'Prince',
    email: 'prince@gmail.com',
    password: 'prince123',
    items: [
      { productId: 'item-grade-a', name: 'Premium Wireless Headphones', price: 1299 },
      { productId: 'item-earbuds', name: 'Wireless Earbuds', price: 2499 },
    ],
  },
  {
    name: 'Priya',
    email: 'priya@gmail.com',
    password: 'priya123',
    items: [
      { productId: 'item-grade-b', name: 'Bluetooth Speaker', price: 799 },
      { productId: 'item-grade-c', name: 'Phone Case', price: 499 },
      { productId: 'item-grade-d', name: 'USB-C Cable (3-Pack)', price: 199 },
    ],
  },
];

/**
 * Default starter history given to any user who has no orders yet. Includes the
 * Wireless Earbuds (whose catalog reference image is set up) so returns can be
 * tested end-to-end out of the box.
 */
export const DEFAULT_STARTER_ITEMS: DemoItemSpec[] = [
  { productId: 'item-grade-a', name: 'Premium Wireless Headphones', price: 1299 },
  { productId: 'item-earbuds', name: 'Wireless Earbuds', price: 2499 },
  { productId: 'item-grade-b', name: 'Bluetooth Speaker', price: 799 },
];

/**
 * Create a delivered order (within the return window) for a customer and write
 * it to both the order repository and the auth service's order-item store.
 * Idempotent: if the customer already has orders, does nothing.
 */
export async function seedOrderForCustomer(
  orderRepo: IOrderRepository,
  authService: MockAuthService,
  customerId: string,
  label: string,
  items: DemoItemSpec[],
): Promise<boolean> {
  const existing = await orderRepo.findByCustomerId(customerId);
  if (existing.length > 0) return false;

  const orderId = `order-${label}-${customerId.slice(-6)}`;
  const placedDate = new Date(Date.now() - 5 * DAY_MS);
  const deliveryDate = new Date(Date.now() - 3 * DAY_MS);

  const orderingItems: OrderingOrderItem[] = items.map((it, i) => ({
    id: `oi-${customerId.slice(-6)}-${i + 1}`,
    orderId,
    customerId,
    productId: it.productId,
    variantId: `var-${it.productId}`,
    productName: it.name,
    productImage: `/images/${it.productId}.jpg`,
    unitPrice: it.price,
    quantity: 1,
    deliveryDate,
    deliveryStatus: 'delivered',
    refundStatus: { code: 'none', amount: null, currency: null, issuedAt: null },
  }));

  const order: Order = {
    id: orderId,
    customerId,
    placedDate,
    status: 'delivered',
    paymentType: 'prepaid',
    items: orderingItems,
  };
  await orderRepo.save(order);

  for (const oi of orderingItems) {
    authService.addOrderItem({
      id: oi.id,
      orderId,
      productId: oi.productId,
      customerId,
      deliveryDate,
      price: oi.unitPrice,
      currency: 'INR',
      productName: oi.productName,
      productImage: oi.productImage,
      catalogImageRef: `catalog/${oi.productId}.jpg`,
    });
  }
  return true;
}

export interface SeedDemoUsersDeps {
  orderRepo: IOrderRepository;
  authService: MockAuthService;
}

/**
 * Upsert the named demo users in Mongo and seed each their curated order
 * history. No-op when Mongo is not connected (tests/offline runs stay safe).
 */
export async function seedDemoUsersAndOrders(deps: SeedDemoUsersDeps): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    console.warn('[Seed] MongoDB not connected — skipping demo user seeding.');
    return;
  }

  for (const u of DEMO_USERS) {
    // Always upsert so the password is guaranteed to match the spec on every
    // restart — prevents "invalid password" if the hash drifted between runs.
    const passwordHash = await bcrypt.hash(u.password, 12);
    const user = await User.findOneAndUpdate(
      { email: u.email },
      { $set: { name: u.name, passwordHash } },
      { upsert: true, new: true },
    );
    const customerId = user._id.toString();
    await seedOrderForCustomer(deps.orderRepo, deps.authService, customerId, u.name.toLowerCase(), u.items);
    console.log(`[Seed] Demo user ${u.name} <${u.email}> → ${customerId}`);
  }
}

/**
 * Lazily ensure a user has a starter order history. Called the first time a user
 * opens their Orders — so every account (incl. fresh signups) can test returns.
 */
export async function ensureStarterOrder(
  orderRepo: IOrderRepository,
  authService: MockAuthService,
  customerId: string,
): Promise<void> {
  await seedOrderForCustomer(orderRepo, authService, customerId, 'starter', DEFAULT_STARTER_ITEMS);
}
