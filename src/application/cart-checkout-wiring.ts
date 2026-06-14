/**
 * Cart & Checkout Wiring — composition root for the cart module.
 *
 * Accepts shared dependencies (event bus, order repo, variant repo, etc.)
 * and wires the internal cart module infrastructure:
 *  - InMemoryCartRepository
 *  - InMemoryOrderMetadataRepository
 *  - MockPaymentProvider
 *  - CartService
 *  - CheckoutService
 *
 * Returns the public service interfaces plus a dispose function for teardown.
 *
 * Requirements: 16.5, 17.1
 */

import type { IEventBus } from '../domain/shared/index.js';
import type { IOrderRepository } from '../domain/ordering/IOrderRepository.js';
import type { IVariantRepository } from '../domain/catalog/IVariantRepository.js';
import type { IProductRepository } from '../domain/catalog/IProductRepository.js';
import type { ICustomerRepository } from '../domain/account/ICustomerRepository.js';
import { defaultCartConfig } from '../domain/cart/CartConfig.js';
import { InMemoryCartRepository } from '../infrastructure/persistence/InMemoryCartRepository.js';
import { InMemoryOrderMetadataRepository } from '../infrastructure/persistence/InMemoryOrderMetadataRepository.js';
import { MockPaymentProvider } from '../infrastructure/payment/MockPaymentProvider.js';
import { CartService, type ICartService } from './cart/CartService.js';
import { CheckoutService, type ICheckoutService } from './cart/CheckoutService.js';

// ─── Shared dependency contract ──────────────────────────────────────────────

export interface CartCheckoutDeps {
  eventBus: IEventBus;
  orderRepository: IOrderRepository;
  variantRepository: IVariantRepository;
  productRepository: IProductRepository;
  customerRepository: ICustomerRepository;
}

// ─── Wiring result ───────────────────────────────────────────────────────────

export interface CartCheckoutWiring {
  cartService: ICartService;
  checkoutService: ICheckoutService;
  dispose: () => void;
}

// ─── Initializer ─────────────────────────────────────────────────────────────

/**
 * Initialize the cart & checkout module with its internal dependencies.
 * Shared dependencies are injected; internal ones (cart repo, order metadata
 * repo, payment provider) are instantiated here.
 */
export function initializeCartCheckoutWiring(deps: CartCheckoutDeps): CartCheckoutWiring {
  // Internal module infrastructure
  const cartRepository = new InMemoryCartRepository();
  const orderMetadataRepository = new InMemoryOrderMetadataRepository();
  const paymentProvider = new MockPaymentProvider();

  // Application services
  const cartService = new CartService(
    cartRepository,
    deps.variantRepository,
    deps.productRepository,
  );

  const checkoutService = new CheckoutService(
    cartService,
    cartRepository,
    paymentProvider,
    deps.orderRepository,
    orderMetadataRepository,
    deps.eventBus,
    deps.variantRepository,
    defaultCartConfig,
    deps.customerRepository,
  );

  return {
    cartService,
    checkoutService,
    dispose: () => {
      // No event subscriptions to clean up in this module currently.
      // Placeholder for future teardown logic (e.g., clearing intervals,
      // unsubscribing event handlers if added later).
    },
  };
}
