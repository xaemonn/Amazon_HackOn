import type { Customer } from '../../domain/account/Customer.js';
import type { ICustomerRepository } from '../../domain/account/ICustomerRepository.js';

export class InMemoryCustomerRepository implements ICustomerRepository {
  private readonly store: Map<string, Customer>;

  constructor(initial: Customer[] = []) {
    this.store = new Map(initial.map((c) => [c.id, c]));
  }

  async save(customer: Customer): Promise<void> {
    this.store.set(customer.id, customer);
  }

  async findById(id: string): Promise<Customer | null> {
    return this.store.get(id) ?? null;
  }

  async findByContact(contact: string): Promise<Customer | null> {
    for (const customer of this.store.values()) {
      if (customer.email === contact) {
        return customer;
      }
    }
    return null;
  }
}
