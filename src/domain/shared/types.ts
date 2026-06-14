// Domain shared types — used across module boundaries via events

/**
 * Structured reason for a return.
 */
export type ReturnReason =
  | 'defective'
  | 'damaged_in_transit'
  | 'wrong_item'
  | 'size_fit'
  | 'not_as_described'
  | 'changed_mind';

/**
 * A reference to a captured media asset (photo or video).
 */
export interface MediaReference {
  id: string;
  type: 'photo_front' | 'photo_back' | 'photo_closeup' | 'video';
  storageKey: string;
  format: 'jpeg' | 'png' | 'mp4' | 'mov';
  sizeBytes: number;
  capturedAt: Date;
}

/**
 * Condition grade assigned by AI grading.
 */
export type ConditionGrade = 'A' | 'B' | 'C' | 'D';

/**
 * Identity verification verdict.
 */
export type IdentityVerdict = 'genuine' | 'mismatch' | 'inconclusive';

/**
 * A detected defect on the returned item.
 */
export interface Defect {
  location: string;
  severity: 'minor' | 'moderate' | 'severe';
  description: string;
}

/**
 * Disposition route determined by the Disposition Engine.
 */
export type DispositionRoute =
  | 'instant_match'
  | 'list_for_resale'
  | 'refurbishment'
  | 'returnless_refund'
  | 'donate_or_recycle'
  | 'manual_inspection';

/**
 * Refund estimate produced alongside a disposition decision.
 */
export interface RefundEstimate {
  amount: number;
  currency: string;
  condition: 'immediate' | 'upon_sale' | 'after_review';
  method: 'original_payment' | 'store_credit';
  isMinimumGuarantee: boolean;
  reasonAware: boolean;
}
