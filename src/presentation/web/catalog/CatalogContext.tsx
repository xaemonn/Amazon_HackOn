import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { InMemoryProductRepository } from '@infrastructure/catalog/InMemoryProductRepository';
import { InMemoryVariantRepository } from '@infrastructure/catalog/InMemoryVariantRepository';
import { InMemoryCategoryRepository } from '@infrastructure/catalog/InMemoryCategoryRepository';
import { SeedDataLoader } from '@infrastructure/catalog/SeedDataLoader';
import { CatalogService } from '@application/catalog/CatalogService';
import { DEFAULT_CATALOG_CONFIG } from '@application/catalog/CatalogConfig';
import type { Product } from '@domain/catalog/Product';
import type { ProductVariant } from '@domain/catalog/ProductVariant';
import type { Category } from '@domain/catalog/Category';
import type { DomainEvent, IEventBus } from '@domain/shared/events';
import type { SearchOptions, SearchResult } from '@application/catalog/SearchService';
import type { DeliveryEstimate } from '@application/catalog/DeliveryEstimate';

// ─── Browser Event Bus ───────────────────────────────────────────────────────

class BrowserEventBus implements IEventBus {
  private handlers = new Map<string, ((event: DomainEvent) => Promise<void>)[]>();

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) ?? [];
    for (const handler of handlers) {
      await handler(event);
    }
  }

  subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  unsubscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): void {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, existing.filter(h => h !== handler));
  }
}

// ─── Context Interface ───────────────────────────────────────────────────────

export interface CatalogContextValue {
  service: CatalogService;
  getProductById: (id: string) => Promise<Product | null>;
  getVariants: (productId: string) => Promise<ProductVariant[]>;
  searchProducts: (keyword: string, options?: SearchOptions) => Promise<SearchResult>;
  getCategories: () => Promise<Category[]>;
  getProductsByCategory: (categoryId: string) => Promise<Product[]>;
  getDeliveryEstimate: () => Promise<DeliveryEstimate>;
  getDeals: () => Promise<{ productId: string; variantId: string; title: string; thumbnailUrl: string; basePrice: number; discountedPrice: number }[]>;
  getSecondLifeItems: () => Promise<{ productId: string; variantId: string; title: string; imageUrl: string; condition: 'Open_Box' | 'Certified_Renewed'; price: number }[]>;
  ready: boolean;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const serviceRef = useRef<CatalogService | null>(null);
  const productRepoRef = useRef<InMemoryProductRepository | null>(null);
  const variantRepoRef = useRef<InMemoryVariantRepository | null>(null);

  useEffect(() => {
    const productRepo = new InMemoryProductRepository();
    const variantRepo = new InMemoryVariantRepository();
    const categoryRepo = new InMemoryCategoryRepository();
    const eventBus = new BrowserEventBus();

    const seedLoader = new SeedDataLoader();
    seedLoader.load(productRepo, variantRepo, categoryRepo);

    const service = new CatalogService(
      productRepo,
      variantRepo,
      categoryRepo,
      eventBus,
      DEFAULT_CATALOG_CONFIG,
    );

    serviceRef.current = service;
    productRepoRef.current = productRepo;
    variantRepoRef.current = variantRepo;
    setReady(true);
  }, []);

  const getProductById = async (id: string) => {
    return serviceRef.current!.getProductById(id);
  };

  const getVariants = async (productId: string) => {
    return serviceRef.current!.getVariantsByProductId(productId);
  };

  const searchProducts = async (keyword: string, options?: SearchOptions) => {
    return serviceRef.current!.searchProducts(keyword, options);
  };

  const getCategories = async () => {
    return serviceRef.current!.getCategories();
  };

  const getProductsByCategory = async (categoryId: string) => {
    return serviceRef.current!.getProductsByCategory(categoryId);
  };

  const getDeliveryEstimate = async () => {
    return serviceRef.current!.getDeliveryEstimate();
  };

  const getDeals = async () => {
    const products = await productRepoRef.current!.findAll();
    const deals: { productId: string; variantId: string; title: string; thumbnailUrl: string; basePrice: number; discountedPrice: number }[] = [];

    for (const product of products) {
      const variants = await variantRepoRef.current!.findByProductId(product.id);
      for (const variant of variants) {
        if (variant.price < product.basePrice && variant.stock > 0) {
          deals.push({
            productId: product.id,
            variantId: variant.id,
            title: product.title,
            thumbnailUrl: product.catalogImageUrl,
            basePrice: product.basePrice,
            discountedPrice: variant.price,
          });
        }
      }
    }

    return deals.slice(0, DEFAULT_CATALOG_CONFIG.maxDealsRailItems);
  };

  const getSecondLifeItems = async () => {
    const products = await productRepoRef.current!.findAll();
    const items: { productId: string; variantId: string; title: string; imageUrl: string; condition: 'Open_Box' | 'Certified_Renewed'; price: number }[] = [];

    for (const product of products) {
      const variants = await variantRepoRef.current!.findByProductId(product.id);
      for (const variant of variants) {
        if ((variant.condition === 'Open_Box' || variant.condition === 'Certified_Renewed') && variant.stock > 0) {
          items.push({
            productId: product.id,
            variantId: variant.id,
            title: product.title,
            imageUrl: product.catalogImageUrl,
            condition: variant.condition,
            price: variant.price,
          });
        }
      }
    }

    return items.slice(0, DEFAULT_CATALOG_CONFIG.maxSecondLifeRailItems);
  };

  const value: CatalogContextValue = {
    service: serviceRef.current!,
    getProductById,
    getVariants,
    searchProducts,
    getCategories,
    getProductsByCategory,
    getDeliveryEstimate,
    getDeals,
    getSecondLifeItems,
    ready,
  };

  return (
    <CatalogContext.Provider value={value}>
      {children}
    </CatalogContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCatalog(): CatalogContextValue {
  const context = useContext(CatalogContext);
  if (!context) {
    throw new Error('useCatalog must be used within a CatalogProvider');
  }
  return context;
}
