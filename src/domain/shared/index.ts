// Domain shared module — base types, event bus interface, domain event types

export type {
  ReturnReason,
  MediaReference,
  ConditionGrade,
  IdentityVerdict,
  Defect,
  DispositionRoute,
  RefundEstimate,
} from './types.js';

export type {
  DomainEvent,
  EventHandler,
  IEventBus,
  ReturnInitiatedEvent,
  ItemGradedEvent,
  DispositionAssignedEvent,
  FraudFlaggedEvent,
  ListingRequestedEvent,
  DeliveryJobCreatedEvent,
  ReturnCancelledEvent,
  ReturnCompletedEvent,
  ManualReviewInitiatedEvent,
  RefundIssuedEvent,
  OrderPlacedEvent,
} from './events.js';

export type { IAuthService, Customer, OrderItem } from './IAuthService.js';
