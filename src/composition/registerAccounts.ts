/**
 * Accounts Module Registrar
 *
 * Accepts shared dependencies and returns the module's public facade.
 * Requirements: 3.1, 3.2, 3.4, 13.2
 */

import type { IEventBus } from '../domain/shared/events.js';
import type { ICustomerRepository } from '../domain/account/ICustomerRepository.js';
import type { IOrderRepository } from '../domain/ordering/IOrderRepository.js';
import { IdentityService } from '../application/identity/IdentityService.js';
import { AccountService } from '../application/account/AccountService.js';
import { OrdersService } from '../application/ordering/OrdersService.js';
import type { IOrdersService } from '../application/ordering/OrdersService.js';
import type { IReturnsFacade, EligibilityResult } from '../application/returns/index.js';
import { InMemoryOtpStore } from '../infrastructure/persistence/InMemoryOtpStore.js';
import { getConfig } from '../infrastructure/config/index.js';

// ─── Dependencies ────────────────────────────────────────────────────────────

export interface AccountsDeps {
  eventBus: IEventBus;
  customerRepository: ICustomerRepository;
  orderRepository: IOrderRepository;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface AccountsModuleResult {
  identityService: IdentityService;
  accountService: AccountService;
  ordersService: IOrdersService;
  dispose: () => void;
}

// ─── Lazy Returns Facade ─────────────────────────────────────────────────────

/**
 * A deferred proxy for IReturnsFacade that allows OrdersService to be
 * constructed before the Returns module is registered. The real facade
 * is connected later via `connect()`.
 *
 * This breaks the circular dependency: Accounts registers before Returns,
 * but OrdersService needs IReturnsFacade for eligibility checks.
 */
class DeferredReturnsFacade implements IReturnsFacade {
  private _delegate: IReturnsFacade | null = null;

  connect(real: IReturnsFacade): void {
    this._delegate = real;
  }

  async checkEligibility(customerId: string, orderItemId: string): Promise<EligibilityResult> {
    if (!this._delegate) {
      return {
        eligible: false,
        daysRemaining: null,
        policyExpirationDate: null,
        productName: '',
        productImage: '',
        orderDate: new Date(0),
        errorMessage: 'Returns module not yet initialized',
      };
    }
    return this._delegate.checkEligibility(customerId, orderItemId);
  }

  async initiateReturn(command: Parameters<IReturnsFacade['initiateReturn']>[0]) {
    if (!this._delegate) {
      throw new Error('Returns module not yet initialized');
    }
    return this._delegate.initiateReturn(command);
  }

  async submitReason(command: Parameters<IReturnsFacade['submitReason']>[0]) {
    if (!this._delegate) {
      throw new Error('Returns module not yet initialized');
    }
    return this._delegate.submitReason(command);
  }

  async submitMedia(command: Parameters<IReturnsFacade['submitMedia']>[0]) {
    if (!this._delegate) {
      throw new Error('Returns module not yet initialized');
    }
    return this._delegate.submitMedia(command);
  }

  async completeMediaCapture(returnRequestId: string) {
    if (!this._delegate) {
      throw new Error('Returns module not yet initialized');
    }
    return this._delegate.completeMediaCapture(returnRequestId);
  }

  async getReturnById(returnRequestId: string) {
    if (!this._delegate) {
      throw new Error('Returns module not yet initialized');
    }
    return this._delegate.getReturnById(returnRequestId);
  }
}

// ─── Registrar ───────────────────────────────────────────────────────────────

/**
 * The deferred facade instance — exported so the composition root can
 * connect the real ReturnsFacade after registerReturns() completes.
 */
let _deferredReturnsFacade: DeferredReturnsFacade | null = null;

/**
 * Connect the real IReturnsFacade to the deferred proxy used by OrdersService.
 * Must be called by the composition root after registerReturns() returns.
 */
export function connectReturnsFacade(realFacade: IReturnsFacade): void {
  if (_deferredReturnsFacade) {
    _deferredReturnsFacade.connect(realFacade);
  }
}

export function registerAccounts(deps: AccountsDeps): AccountsModuleResult {
  const { eventBus, customerRepository, orderRepository } = deps;

  // Module-internal infrastructure: OTP store (not shared across modules)
  const otpStore = new InMemoryOtpStore();
  const config = getConfig();

  // Instantiate IdentityService (implements both IIdentityService and IAuthService)
  const identityService = new IdentityService(
    customerRepository,
    orderRepository,
    otpStore,
    config,
  );

  // Instantiate AccountService
  const accountService = new AccountService(customerRepository);

  // Create a deferred proxy for IReturnsFacade — OrdersService needs it
  // but the Returns module hasn't been registered yet.
  const deferredReturnsFacade = new DeferredReturnsFacade();
  _deferredReturnsFacade = deferredReturnsFacade;

  // Instantiate OrdersService with the shared event bus (subscribes to RefundIssued)
  const ordersService: IOrdersService = new OrdersService(
    orderRepository,
    deferredReturnsFacade,
    eventBus,
  );

  return {
    identityService,
    accountService,
    ordersService,
    dispose: () => {
      // OrdersService subscribed to RefundIssued on the event bus at construction.
      // The event bus handles cleanup when it is discarded (no explicit unsubscribe API).
      // Reset the deferred facade reference.
      _deferredReturnsFacade = null;
    },
  };
}
