/**
 * Cart Module Registrar
 *
 * Accepts shared dependencies and returns the module's public facade.
 * Delegates to the existing initializeCartCheckoutWiring function which
 * handles internal dependency creation (InMemoryCartRepository, etc.).
 *
 * Requirements: 3.1, 3.2, 3.4, 13.2
 */

import type { IEventBus } from '../domain/shared/events.js';
import type { IOrderRepository } from '../domain/ordering/IOrderRepository.js';
import type { IVariantRepository } from '../domain/catalog/IVariantRepository.js';
import type { IProductRepository } from '../domain/catalog/IProductRepository.js';
import type { ICustomerRepository } from '../domain/account/ICustomerRepository.js';
import type { ICartService } from '../application/cart/CartService.js';
import type { ICheckoutService } from '../application/cart/CheckoutService.js';
import { initializeCartCheckoutWiring } from '../application/cart-checkout-wiring.js';

// ─── Dependencies ────────────────────────────────────────────────────────────

export interface CartDeps {
  eventBus: IEventBus;
  orderRepository: IOrderRepository;
  variantRepository: IVariantRepository;
  productRepository: IProductRepository;
  customerRepository: ICustomerRepository;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface CartModuleResult {
  cartService: ICartService;
  checkoutService: ICheckoutService;
  dispose: () => void;
}

// ─── Registrar ───────────────────────────────────────────────────────────────

export function registerCart(deps: CartDeps): CartModuleResult {
  const wiring = initializeCartCheckoutWiring({
    eventBus: deps.eventBus,
    orderRepository: deps.orderRepository,
    variantRepository: deps.variantRepository,
    productRepository: deps.productRepository,
    customerRepository: deps.customerRepository,
  });

  return {
    cartService: wiring.cartService,
    checkoutService: wiring.checkoutService,
    dispose: wiring.dispose,
  };
}
