/**
 * Unified Seed Loader — produces one coherent dataset spanning all modules.
 *
 * Uses upsert semantics: running multiple times produces identical state without
 * duplicates. Throws on error to prevent server startup.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14
 */

import type { IProductRepository } from '../domain/catalog/IProductRepository.js';
import type { IVariantRepository } from '../domain/catalog/IVariantRepository.js';
import type { ICategoryRepository } from '../domain/catalog/ICategoryRepository.js';
import type { ICustomerRepository } from '../domain/account/ICustomerRepository.js';
import type { IOrderRepository } from '../domain/ordering/IOrderRepository.js';

import { Product } from '../domain/catalog/Product.js';
import { ProductVariant } from '../domain/catalog/ProductVariant.js';
import { Category } from '../domain/catalog/Category.js';
import type { Customer } from '../domain/account/Customer.js';
import type { Order } from '../domain/ordering/Order.js';
import type { OrderItem } from '../domain/ordering/OrderItem.js';
import type { PaymentMethod } from '../domain/account/PaymentMethod.js';
import type { Address } from '../domain/account/Address.js';
import { defaultAllEnabled } from '../domain/account/NotificationPreferences.js';

// ─── SeedDeps Interface ──────────────────────────────────────────────────────

/**
 * Accepts repository interfaces (not concrete classes) — satisfies Dependency
 * Inversion; compatible with both InMemory and DynamoDB adapters.
 */
export interface SeedDeps {
  productRepository: IProductRepository;
  variantRepository: IVariantRepository;
  categoryRepository: ICategoryRepository;
  customerRepository: ICustomerRepository;
  orderRepository: IOrderRepository;
}

// ─── Seed Data Constants ─────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'cat-electronics', name: 'Electronics', imageUrl: '/assets/categories/electronics.jpg' },
  { id: 'cat-footwear', name: 'Footwear', imageUrl: '/assets/categories/footwear.jpg' },
  { id: 'cat-home', name: 'Home', imageUrl: '/assets/categories/home.jpg' },
] as const;

const PRODUCTS = [
  {
    id: 'prod-headphones-001',
    title: 'Sony WH-1000XM5 Wireless Headphones',
    brand: 'Sony',
    category: 'cat-electronics',
    basePrice: 29990,
    averageRating: 4.6,
    reviewCount: 12453,
  },
  {
    id: 'prod-cable-002',
    title: 'USB-C Charging Cable 1m',
    brand: 'AmazonBasics',
    category: 'cat-electronics',
    basePrice: 299, // < 500
    averageRating: 4.1,
    reviewCount: 8732,
  },
  {
    id: 'prod-speaker-003',
    title: 'JBL Flip 6 Portable Speaker',
    brand: 'JBL',
    category: 'cat-electronics',
    basePrice: 11999,
    averageRating: 4.4,
    reviewCount: 5621,
  },
  {
    id: 'prod-sneakers-004',
    title: 'Adidas Ultraboost 22 Running Shoes',
    brand: 'Adidas',
    category: 'cat-footwear',
    basePrice: 16999,
    fitMetadata: { sizeOffsetIndicator: 'runs_small' as const, offsetMagnitude: 1 },
    averageRating: 4.3,
    reviewCount: 3201,
  },
  {
    id: 'prod-sandals-005',
    title: 'Nike Comfort Slide Sandals',
    brand: 'Nike',
    category: 'cat-footwear',
    basePrice: 2499,
    averageRating: 4.0,
    reviewCount: 1540,
  },
  {
    id: 'prod-lamp-006',
    title: 'Philips Smart LED Desk Lamp',
    brand: 'Philips',
    category: 'cat-home',
    basePrice: 3499, // >= 500
    averageRating: 4.2,
    reviewCount: 920,
  },
] as const;


const VARIANTS = [
  // prod-headphones-001: New + Open_Box + Certified_Renewed (Req 4.2)
  {
    id: 'var-headphones-new',
    productId: 'prod-headphones-001',
    condition: 'New' as const,
    price: 29990,
    stock: 10,
  },
  {
    id: 'var-headphones-openbox',
    productId: 'prod-headphones-001',
    condition: 'Open_Box' as const,
    price: 23990,
    stock: 2,
    sourceReturnId: 'ret-hpob-001',
    conditionReport: 'Opened but unused. All accessories intact. Original packaging slightly worn.',
  },
  {
    id: 'var-headphones-renewed',
    productId: 'prod-headphones-001',
    condition: 'Certified_Renewed' as const,
    price: 25990,
    stock: 3,
    sourceReturnId: 'ret-hpcr-002',
    conditionReport: 'Professionally inspected and certified. Minor cosmetic marks on headband, fully functional.',
  },
  // prod-cable-002: New
  {
    id: 'var-cable-new',
    productId: 'prod-cable-002',
    condition: 'New' as const,
    price: 299,
    stock: 50,
  },
  // prod-speaker-003: New
  {
    id: 'var-speaker-new',
    productId: 'prod-speaker-003',
    condition: 'New' as const,
    price: 11999,
    stock: 8,
  },
  // prod-sneakers-004: New
  {
    id: 'var-sneakers-new',
    productId: 'prod-sneakers-004',
    condition: 'New' as const,
    price: 16999,
    stock: 15,
  },
  // prod-sandals-005: New
  {
    id: 'var-sandals-new',
    productId: 'prod-sandals-005',
    condition: 'New' as const,
    price: 2499,
    stock: 20,
  },
  // prod-lamp-006: New
  {
    id: 'var-lamp-new',
    productId: 'prod-lamp-006',
    condition: 'New' as const,
    price: 3499,
    stock: 12,
  },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Main Seed Function ──────────────────────────────────────────────────────

/**
 * Idempotent seed loader. Uses upsert semantics so running multiple times
 * produces identical state without duplicates.
 *
 * @throws Error if any seed step fails — prevents server startup.
 */
export async function loadUnifiedSeed(deps: SeedDeps): Promise<void> {
  const {
    productRepository,
    variantRepository,
    categoryRepository,
    customerRepository,
    orderRepository,
  } = deps;

  try {
    // ─── 1. Seed Categories (Req 4.9) ─────────────────────────────────────
    for (const catData of CATEGORIES) {
      const existing = await categoryRepository.findById(catData.id);
      if (!existing) {
        const category = new Category(catData);
        // ICategoryRepository doesn't have save — use the concrete method if available
        // We use a duck-typed approach: if the repo has addCategory, call it
        const repo = categoryRepository as ICategoryRepository & { addCategory?: (c: Category) => void };
        if (typeof repo.addCategory === 'function') {
          repo.addCategory(category);
        }
      }
    }

    // ─── 2. Seed Products (Req 4.1, 4.3, 4.4, 4.5, 4.6) ─────────────────
    for (const prodData of PRODUCTS) {
      const existing = await productRepository.findById(prodData.id);
      if (!existing) {
        const product = new Product({
          ...prodData,
          catalogImageUrl: `/assets/products/${prodData.id}.jpg`,
        });
        // IProductRepository doesn't have save — use the concrete method if available
        const repo = productRepository as IProductRepository & {
          addProduct?: (p: Product) => void;
          addCategoryMapping?: (catId: string, catName: string) => void;
        };
        if (typeof repo.addProduct === 'function') {
          repo.addProduct(product);
        }
      }
    }

    // Register category mappings for search (idempotent — re-applying is safe)
    const prodRepo = productRepository as IProductRepository & {
      addCategoryMapping?: (catId: string, catName: string) => void;
    };
    if (typeof prodRepo.addCategoryMapping === 'function') {
      for (const catData of CATEGORIES) {
        prodRepo.addCategoryMapping(catData.id, catData.name);
      }
    }

    // ─── 3. Seed Variants (Req 4.2) ──────────────────────────────────────
    for (const varData of VARIANTS) {
      const existing = await variantRepository.findById(varData.id);
      if (!existing) {
        const variant = new ProductVariant({
          id: varData.id,
          productId: varData.productId,
          condition: varData.condition,
          price: varData.price,
          stock: varData.stock,
          sourceReturnId: 'sourceReturnId' in varData ? varData.sourceReturnId : undefined,
          conditionReport: 'conditionReport' in varData ? varData.conditionReport : undefined,
        });
        await variantRepository.save(variant);
      }
    }

    // ─── 4. Seed Demo Customer (Req 4.7, 4.13) ───────────────────────────
    const existingCustomer = await customerRepository.findById('demo-customer-1');
    if (!existingCustomer) {
      const address: Address = {
        id: 'addr-demo-1',
        recipientName: 'Priya Sharma',
        streetLine1: '42 MG Road, Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
        country: 'India',
        isDefault: true,
        createdAt: new Date('2024-01-15T10:00:00Z'),
      };

      const upiPayment: PaymentMethod = {
        id: 'pay-upi-demo-1',
        type: 'upi',
        upiId: 'priya@okaxis',
        isPreferred: true,
        createdAt: new Date('2024-01-15T10:00:00Z'),
      };

      const customer: Customer = {
        id: 'demo-customer-1',
        name: 'Priya Sharma',
        email: 'demo@example.com',
        addresses: [address],
        paymentMethods: [upiPayment],
        notificationPreferences: defaultAllEnabled(),
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
      };

      await customerRepository.save(customer);
    }

    // ─── 5. Seed Delivered Order (Req 4.8, 4.14) ─────────────────────────
    const existingOrder = await orderRepository.findById('order-demo-001');
    if (!existingOrder) {
      const deliveryDate = daysAgo(3);

      const orderItem: OrderItem = {
        id: 'oi-demo-001',
        orderId: 'order-demo-001',
        customerId: 'demo-customer-1',
        productId: 'prod-headphones-001',
        variantId: 'var-headphones-new',
        productName: 'Sony WH-1000XM5 Wireless Headphones',
        productImage: '/assets/products/prod-headphones-001.jpg',
        unitPrice: 29990,
        quantity: 1,
        deliveryDate,
        deliveryStatus: 'delivered',
        refundStatus: { code: 'none', amount: null, currency: null, issuedAt: null },
      };

      const order: Order = {
        id: 'order-demo-001',
        customerId: 'demo-customer-1',
        placedDate: daysAgo(7),
        status: 'delivered',
        paymentType: 'prepaid',
        items: [orderItem],
      };

      await orderRepository.save(order);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[UnifiedSeed] Seed failed: ${message}`);
  }
}
