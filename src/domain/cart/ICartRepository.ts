import type { Cart } from './Cart.js';

/**
 * Repository interface for Cart aggregate persistence.
 * Implementations provide storage and retrieval of Cart instances keyed by customer ID.
 */
export interface ICartRepository {
  findByCustomerId(customerId: string): Promise<Cart | null>;
  save(cart: Cart): Promise<void>;
}
