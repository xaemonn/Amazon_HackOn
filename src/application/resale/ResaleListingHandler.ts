/**
 * ResaleListingHandler — subscribes to DispositionAssigned and relists graded
 * returns into the marketplace.
 *
 *   Grade A → "Like New" direct-transfer listing
 *   Grade B → "Returned" discounted listing
 *   Grade C → "Refurbished" discounted listing
 *   Grade D / null → no listing (handled by other disposition routes)
 *
 * Keeping listing creation in an event subscriber (rather than inline in the
 * DispositionOrchestrator) keeps the modules decoupled: the disposition engine
 * doesn't need to know the marketplace exists.
 */

import type { IEventBus, DomainEvent } from '../../domain/shared/events.js';
import type { IAuthService } from '../../domain/shared/IAuthService.js';
import type { IConditionAssessmentRepository } from '../../domain/grading/IConditionAssessmentRepository.js';
import { isResaleGrade } from '../../domain/resale/index.js';
import type { ResaleService } from './ResaleService.js';
import type { IReturnRequestLookup } from '../disposition/DispositionOrchestrator.js';

export interface ResaleListingHandlerDeps {
  eventBus: IEventBus;
  conditionAssessmentRepository: IConditionAssessmentRepository;
  returnRequestLookup: IReturnRequestLookup;
  authService: IAuthService;
  resaleService: ResaleService;
  /** Look up the returner's registered city by their customer ID. Falls back to defaultSellerCity. */
  getCustomerCity: (customerId: string) => Promise<string | null>;
  /** City assigned to the seller when no per-customer address is available. */
  defaultSellerCity: string;
}

export class ResaleListingHandler {
  private readonly handler: (event: DomainEvent) => Promise<void>;

  constructor(private readonly deps: ResaleListingHandlerDeps) {
    this.handler = this.onDispositionAssigned.bind(this);
  }

  initialize(): void {
    this.deps.eventBus.subscribe('DispositionAssigned', this.handler);
  }

  dispose(): void {
    this.deps.eventBus.unsubscribe('DispositionAssigned', this.handler);
  }

  private async onDispositionAssigned(event: DomainEvent): Promise<void> {
    const returnRequestId = (event.payload as { returnRequestId: string }).returnRequestId;

    try {
      const assessment =
        await this.deps.conditionAssessmentRepository.findByReturnRequestId(returnRequestId);
      if (!assessment || !isResaleGrade(assessment.grade)) {
        return; // Not a resellable grade (D / null) — nothing to relist.
      }

      const returnData = await this.deps.returnRequestLookup.findById(returnRequestId);
      if (!returnData) return;

      const orderItem = await this.deps.authService.getOrderItem(returnData.orderItemId);
      const productName = orderItem?.productName ?? returnData.productId;
      const originalPrice = orderItem?.price ?? returnData.itemValue;
      const currency = orderItem?.currency ?? returnData.currency;

      const sellerCity =
        (await this.deps.getCustomerCity(returnData.customerId)) ??
        this.deps.defaultSellerCity;

      const listing = await this.deps.resaleService.createListingFromReturn({
        returnRequestId,
        grade: assessment.grade,
        productId: returnData.productId,
        productName,
        imageUrl: `/api/catalog/images/${returnData.productId}`,
        originalPrice,
        currency,
        sellerCustomerId: returnData.customerId,
        sellerCity,
      });

      console.log('[ResaleListingHandler] Relisted graded return', {
        returnRequestId,
        grade: assessment.grade,
        listingId: listing.id,
        listingType: listing.listingType,
        listedPrice: listing.listedPrice,
      });
    } catch (err) {
      console.error(
        `[ResaleListingHandler] Failed to relist return ${returnRequestId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
