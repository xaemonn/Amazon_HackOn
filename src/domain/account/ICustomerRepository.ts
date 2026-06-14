import type { Customer } from './Customer.js';

export interface ICustomerRepository {
  save(customer: Customer): Promise<void>;
  findById(id: string): Promise<Customer | null>;
  findByContact(contact: string): Promise<Customer | null>;
}
