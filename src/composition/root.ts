/**
 * Composition Root — the single file that instantiates all concrete
 * infrastructure classes and calls each module's self-registration function.
 *
 * This is the ONLY production source file that imports and instantiates:
 *  - InProcessEventBus
 *  - InMemoryProductRepository, InMemoryVariantRepository, InMemoryCategoryRepository
 *  - InMemoryCustomerRepository, InMemoryOrderRepository, InMemoryReturnRequestRepository
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import type { IEventBus } from '../domain/shared/events.js';
import type { IProductRepository } from '../domain/catalog/IProductRepository.js';
import type { IVariantRepository } from '../domain/catalog/IVariantRepository.js';
import type { ICategoryRepository } from '../domain/catalog/ICategoryRepository.js';
import type { ICustomerRepository } from '../domain/account/ICustomerRepository.js';
import type { IOrderRepository } from '../domain/ordering/IOrderRepository.js';
import type { IReturnRequestRepository } from '../domain/returns/IReturnRequestRepository.js';

// ─── Concrete infrastructure imports (only in this file) ─────────────────────

import { InProcessEventBus } from '../infrastructure/events/InProcessEventBus.js';
import { InMemoryProductRepository } from '../infrastructure/catalog/InMemoryProductRepository.js';
import { InMemoryVariantRepository } from '../infrastructure/catalog/InMemoryVariantRepository.js';
import { InMemoryCategoryRepository } from '../infrastructure/catalog/InMemoryCategoryRepository.js';
import { InMemoryCustomerRepository } from '../infrastructure/persistence/InMemoryCustomerRepository.js';
import { InMemoryOrderRepository } from '../infrastructure/persistence/InMemoryOrderRepository.js';
import { InMemoryReturnRequestRepository } from '../infrastructure/persistence/InMemoryReturnRequestRepository.js';

// ─── Module registrar imports (implemented in tasks 1.2–1.5) ─────────────────

import { registerCatalog } from './registerCatalog.js';
import type { CatalogModuleResult } from './registerCatalog.js';
import { registerAccounts, connectReturnsFacade } from './registerAccounts.js';
import type { AccountsModuleResult } from './registerAccounts.js';
import { registerReturns } from './registerReturns.js';
import type { ReturnsModuleResult } from './registerReturns.js';
import { registerCart } from './registerCart.js';
import type { CartModuleResult } from './registerCart.js';

// ─── Cross-module event handler imports ──────────────────────────────────────

import { ListingRequestedHandler } from '../application/catalog/ListingRequestedHandler.js';
import type { ILogger } from '../application/catalog/ListingRequestedHandler.js';

// ─── Shared repository collection ───────────────────────────────────────────

export interface SharedRepositories {
  productRepository: IProductRepository;
  variantRepository: IVariantRepository;
  categoryRepository: ICategoryRepository;
  customerRepository: ICustomerRepository;
  orderRepository: IOrderRepository;
  returnRequestRepository: IReturnRequestRepository;
}

// ─── CompositionResult ───────────────────────────────────────────────────────

export interface CompositionResult {
  eventBus: IEventBus;
  repos: SharedRepositories;
  catalogModule: CatalogModuleResult;
  accountsModule: AccountsModuleResult;
  returnsModule: ReturnsModuleResult;
  cartModule: CartModuleResult;
  dispose: () => void;
}

// ─── Composition Root Factory ────────────────────────────────────────────────

/**
 * Creates the composition root: instantiates shared infrastructure,
 * calls module registrars in order (Catalog → Accounts → Returns → Cart),
 * wires cross-module event subscriptions, and returns the unified result.
 *
 * This function is synchronous and should be called once at application startup.
 */
export function createCompositionRoot(): CompositionResult {
  // 1. Instantiate the single shared event bus (Requirement 1.1, 1.4)
  const eventBus: IEventBus = new InProcessEventBus();

  // 2. Instantiate shared repositories (Requirement 2.1, 2.5)
  const productRepository: IProductRepository = new InMemoryProductRepository();
  const variantRepository: IVariantRepository = new InMemoryVariantRepository();
  const categoryRepository: ICategoryRepository = new InMemoryCategoryRepository();
  const customerRepository: ICustomerRepository = new InMemoryCustomerRepository();
  const orderRepository: IOrderRepository = new InMemoryOrderRepository();
  const returnRequestRepository: IReturnRequestRepository = new InMemoryReturnRequestRepository();

  const repos: SharedRepositories = {
    productRepository,
    variantRepository,
    categoryRepository,
    customerRepository,
    orderRepository,
    returnRequestRepository,
  };

  // 3. Call module registrars in deterministic order (Requirement 3.1)
  //    Catalog → Accounts → Returns → Cart

  const catalogModule = registerCatalog({
    eventBus,
    productRepository,
    variantRepository,
    categoryRepository,
  });

  const accountsModule = registerAccounts({
    eventBus,
    customerRepository,
    orderRepository,
  });

  // Returns receives accountsModule.identityService as its IAuthService (Requirement 2.2, 2.4)
  const returnsModule = registerReturns({
    eventBus,
    returnRequestRepository,
    orderRepository,
    customerRepository,
    productRepository,
    authService: accountsModule.identityService,
  });

  // Connect the real ReturnsFacade to the deferred proxy used by OrdersService
  connectReturnsFacade(returnsModule.returnsFacade);

  // Cart receives the same shared repos used by Catalog and Accounts (Requirement 2.3)
  const cartModule = registerCart({
    eventBus,
    orderRepository,
    variantRepository,
    productRepository,
    customerRepository,
  });

  // 4. Wire cross-module event subscriptions (Requirement 3.3, 3.5, 7.1, 8.1)
  //    All subscriptions are registered AFTER all module registrars complete
  //    and BEFORE the Express app begins accepting connections.

  // 4a. ListingRequestedHandler — subscribes to ListingRequested events
  //     and delegates to CatalogService to create Open_Box variants.
  const catalogLogger: ILogger = {
    info: (entry) => console.log(`[Catalog:info] ${entry.message}`, entry),
    warn: (entry) => console.warn(`[Catalog:warn] ${entry.message}`, entry),
    error: (entry) => console.error(`[Catalog:error] ${entry.message}`, entry),
  };

  // The handler self-subscribes to 'ListingRequested' in its constructor
  const _listingRequestedHandler = new ListingRequestedHandler(
    catalogModule.catalogService,
    eventBus,
    catalogLogger,
  );

  // 4b. OrdersService already subscribes to 'RefundIssued' at construction
  //     time (via the shared event bus injected in registerAccounts). ✅

  // 4c. DispositionOrchestrator is already initialized in registerReturns
  //     and subscribes to 'ItemGraded'. When disposition route is
  //     'list_for_resale', it publishes 'ListingRequested' which the
  //     ListingRequestedHandler above will receive. ✅

  // 5. Return the unified composition result with dispose
  return {
    eventBus,
    repos,
    catalogModule,
    accountsModule,
    returnsModule,
    cartModule,
    dispose: () => {
      catalogModule.dispose();
      accountsModule.dispose();
      returnsModule.dispose();
      cartModule.dispose();
    },
  };
}
