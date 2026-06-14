import type { Cart } from '../../domain/cart/Cart.js';
import type { ICartRepository } from '../../domain/cart/ICartRepository.js';

export class InMemoryCartRepository implements ICartRepository {
  private readonly store: Map<string, Cart>;

  constructor(initial: Cart[] = []) {
    this.store = new Map(initial.map((c) => [c.customerId, c]));
  }

  async findByCustomerId(customerId: string): Promise<Cart | null> {
    return this.store.get(customerId) ?? null;
  }

  async save(cart: Cart): Promise<void> {
    this.store.set(cart.customerId, cart);
  }
}
