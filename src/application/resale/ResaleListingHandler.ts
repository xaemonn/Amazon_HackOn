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
    const payload = event.payload as { returnRequestId: string; route?: string };
    const returnRequestId = payload.returnRequestId;

    try {
      const assessment =
        await this.deps.conditionAssessmentRepository.findByReturnRequestId(returnRequestId);
      if (!assessment) return;

      // Items flagged for human review (reason↔photo mismatch, wrong item,
      // manipulated photos, fraud) must NOT be relisted — they go to manual
      // inspection instead.
      if (assessment.requiresManualReview) {
        return;
      }

      // Only Grade A (Like New) and Grade B (discounted) are relisted for resale.
      // Grade C → refund + recycle/keep; Grade D → manual/recycle. Neither is relisted.
      if (assessment.grade !== 'A' && assessment.grade !== 'B') {
        return;
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

      // Build photo URLs from the customer's actual return media.
      // Photos are served via /api/media/:storageKey (uploaded during the return flow).
      // Fall back to the catalog image only when no photos were submitted.
      const photoUrls = returnData.media
        .filter((m) => m.type !== 'video')
        .map((m) => `/api/media/${m.storageKey}`);

      const primaryImageUrl =
        photoUrls[0] ?? `/api/catalog/images/${returnData.productId}`;

      const listing = await this.deps.resaleService.createListingFromReturn({
        returnRequestId,
        grade: assessment.grade,
        productId: returnData.productId,
        productName,
        imageUrl: primaryImageUrl,
        returnPhotoUrls: photoUrls,
        conditionReasoning: assessment.reasoning ?? null,
        defects: assessment.defects ?? [],
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
