// Returns domain module — ReturnRequest entity, state machine, value objects, repositories

// ─── ReturnRequest entity ─────────────────────────────────────────────────────

export type { ReturnState, ReturnRequestProps } from './ReturnRequest.js';
export { ReturnRequest } from './ReturnRequest.js';

// ─── OrderItem ────────────────────────────────────────────────────────────────

export type { OrderItem } from './OrderItem.js';

// ─── Eligibility ─────────────────────────────────────────────────────────────

export type { EligibilityConfig, EligibilityResult } from './ReturnEligibilityService.js';
export { ReturnEligibilityService, OwnershipError } from './ReturnEligibilityService.js';

// ─── State Machine ────────────────────────────────────────────────────────────

export type { IReturnStateMachine, TransitionOptions } from './ReturnStateMachine.js';
export { LEGAL_TRANSITIONS, ReturnStateMachine } from './ReturnStateMachine.js';

// ─── Value objects ────────────────────────────────────────────────────────────

// ReturnReason
export type { ReturnReason } from './ReturnReason.js';
export { RETURN_REASONS, isValidReturnReason, isFaultReason, isChoiceReason } from './ReturnReason.js';

// ReasonDetails
export { validateReasonDetails, ReasonDetailsError, MAX_REASON_DETAILS_LENGTH } from './ReasonDetails.js';

// ReturnAbusePolicy
export type {
  ReturnAbuseConfig,
  ReturnRiskLevel,
  ReturnPolicyDecision,
} from './ReturnAbusePolicy.js';
export { evaluateReturnPolicy } from './ReturnAbusePolicy.js';

// MediaCompleteness
export type { MediaCompletenessResult } from './MediaCompleteness.js';
export {
  PHOTO_MAX_SIZE_BYTES,
  VIDEO_MAX_SIZE_BYTES,
  VALID_PHOTO_FORMATS,
  VALID_VIDEO_FORMATS,
  REQUIRED_PHOTO_TYPES,
  MediaValidationError,
  validateSingleMedia,
  checkMediaCompleteness,
} from './MediaCompleteness.js';

// ─── Repository interfaces ────────────────────────────────────────────────────

export type { IReturnRequestRepository } from './IReturnRequestRepository.js';
export type { IAuditLogRepository, AuditRecord } from './IAuditLogRepository.js';

// ─── Media storage interface ──────────────────────────────────────────────────

export type { IMediaStorage, MediaValidationResult } from './IMediaStorage.js';
