// src/application/catalog/ListingRequestedHandler.ts

import type { DomainEvent, IEventBus } from '../../domain/shared/events.js';
import type { CatalogService } from './CatalogService.js';

// ─── Structured Logging Types ────────────────────────────────────────────────

export interface CatalogLogEntry {
  timestamp: string;        // ISO 8601
  level: 'info' | 'warn' | 'error';
  module: 'catalog';
  action: string;           // e.g., 'listing_requested_discard'
  eventId?: string;
  returnRequestId?: string;
  productId?: string;
  discardReason?: string;   // e.g., 'unknown_productId', 'invalid_grade', 'duplicate', 'malformed_field'
  invalidField?: string;    // which field failed validation
  message: string;
}

export interface ILogger {
  info(entry: CatalogLogEntry): void;
  warn(entry: CatalogLogEntry): void;
  error(entry: CatalogLogEntry): void;
}

// ─── ListingRequestedHandler ─────────────────────────────────────────────────

export class ListingRequestedHandler {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
  ) {
    this.eventBus.subscribe('ListingRequested', this.handle.bind(this));
  }

  async handle(event: DomainEvent): Promise<void> {
    try {
      const payload = event.payload;

      // 1. Validate required fields
      const requiredStringFields = ['returnRequestId', 'productId', 'conditionGrade', 'assessmentSummary'] as const;

      for (const field of requiredStringFields) {
        const value = payload[field];
        if (!value || typeof value !== 'string' || (value as string).trim().length === 0) {
          this.logger.error({
            timestamp: new Date().toISOString(),
            level: 'error',
            module: 'catalog',
            action: 'listing_requested_discard',
            eventId: event.eventId,
            returnRequestId: typeof payload.returnRequestId === 'string' ? payload.returnRequestId : undefined,
            productId: typeof payload.productId === 'string' ? payload.productId : undefined,
            discardReason: 'malformed_field',
            invalidField: field,
            message: `Discarded ListingRequested event: field '${field}' is missing, empty, or not a string`,
          });
          return;
        }
      }

      // Validate mediaReferences is a non-empty array
      const mediaReferences = payload.mediaReferences;
      if (!Array.isArray(mediaReferences) || mediaReferences.length === 0) {
        this.logger.error({
          timestamp: new Date().toISOString(),
          level: 'error',
          module: 'catalog',
          action: 'listing_requested_discard',
          eventId: event.eventId,
          returnRequestId: payload.returnRequestId as string,
          productId: payload.productId as string,
          discardReason: 'malformed_field',
          invalidField: 'mediaReferences',
          message: `Discarded ListingRequested event: field 'mediaReferences' is missing, empty, or not an array`,
        });
        return;
      }

      const returnRequestId = payload.returnRequestId as string;
      const productId = payload.productId as string;
      const conditionGrade = payload.conditionGrade as string;
      const assessmentSummary = payload.assessmentSummary as string;

      // 2. Reject non-A grades
      if (conditionGrade !== 'A') {
        this.logger.info({
          timestamp: new Date().toISOString(),
          level: 'info',
          module: 'catalog',
          action: 'listing_requested_discard',
          eventId: event.eventId,
          returnRequestId,
          productId,
          discardReason: 'invalid_grade',
          message: `Discarded ListingRequested event: conditionGrade '${conditionGrade}' is not 'A'`,
        });
        return;
      }

      // 3. Delegate to CatalogService
      const result = await this.catalogService.createVariantFromListing({
        returnRequestId,
        productId,
        conditionGrade,
        assessmentSummary,
        mediaReferences: mediaReferences as import('../../domain/shared/types.js').MediaReference[],
      });

      if (result.success === true) {
        this.logger.info({
          timestamp: new Date().toISOString(),
          level: 'info',
          module: 'catalog',
          action: 'listing_variant_created',
          eventId: event.eventId,
          returnRequestId,
          productId,
          message: `Variant created successfully for return request '${returnRequestId}'`,
        });
        return;
      }

      // result.success === false — map CatalogService error types to appropriate log entries
      {
        const error = result.error;

        switch (error.type) {
          case 'not_found':
            this.logger.warn({
              timestamp: new Date().toISOString(),
              level: 'warn',
              module: 'catalog',
              action: 'listing_requested_discard',
              eventId: event.eventId,
              returnRequestId,
              productId,
              discardReason: 'unknown_productId',
              message: `Discarded ListingRequested event: product '${productId}' not found in catalog`,
            });
            break;

          case 'duplicate':
            this.logger.info({
              timestamp: new Date().toISOString(),
              level: 'info',
              module: 'catalog',
              action: 'listing_requested_discard',
              eventId: event.eventId,
              returnRequestId,
              productId,
              discardReason: 'duplicate',
              message: `Skipped ListingRequested event: variant already exists for return request '${returnRequestId}'`,
            });
            break;

          default:
            this.logger.error({
              timestamp: new Date().toISOString(),
              level: 'error',
              module: 'catalog',
              action: 'listing_requested_error',
              eventId: event.eventId,
              returnRequestId,
              productId,
              message: `Failed to create variant: ${error.message}`,
            });
            break;
        }
      }
    } catch (err: unknown) {
      // NEVER THROW — always catch and log
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({
        timestamp: new Date().toISOString(),
        level: 'error',
        module: 'catalog',
        action: 'listing_requested_unhandled_error',
        eventId: event.eventId,
        message: `Unhandled error in ListingRequestedHandler: ${message}`,
      });
    }
  }
}
