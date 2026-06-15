/**
 * Configurable Parameters Module
 *
 * Typed configuration with environment variable overrides and fallback defaults.
 * All parameters referenced in the design document are defined here.
 *
 * Environment variable naming: ZTR_<SECTION>_<PARAM> (all uppercase, underscore-separated)
 */

// ─── Return Window ───────────────────────────────────────────────────────────

export interface ReturnWindowConfig {
  /** Default return window in days */
  defaultDays: number;
}

// ─── Grading Timeouts & Retry ────────────────────────────────────────────────

export interface GradingTimeoutsConfig {
  /** IConditionGrader timeout in milliseconds */
  conditionGraderTimeoutMs: number;
  /** IIdentityVerifier timeout in milliseconds */
  identityVerifierTimeoutMs: number;
  /** Delay before retrying a failed grading call, in milliseconds */
  retryDelayMs: number;
  /** Maximum number of retries for grading calls */
  maxRetries: number;
}

// ─── Fraud Detection ─────────────────────────────────────────────────────────

export interface FraudConfig {
  /** Fraud score threshold; scores >= this trigger FraudFlagged event */
  threshold: number;
  /** Fraud score increment per unsupported claim */
  unsupportedClaimIncrement: number;
  /** Number of days to look back for return history frequency */
  historyWindowDays: number;
}

// ─── Disposition Engine ──────────────────────────────────────────────────────

export interface DispositionThresholdsConfig {
  /** Confidence score below which item routes to manual inspection */
  lowConfidenceThreshold: number;
  /** Item value below which Grade C/D items get returnless refund (in ₹) */
  returnlessRefundMaxValue: number;
  /** Maximum distance in km for instant-match with a nearby buyer */
  instantMatchRadiusKm: number;
}

// ─── Refund Percentages (choice reasons only; fault reasons are always 100%) ─

export interface RefundPercentagesConfig {
  instant_match: number;
  returnless_refund: number;
  list_for_resale: number;
  refurbishment: number;
  donate_or_recycle: number;
  manual_inspection: number;
}

// ─── Event Bus Retry ─────────────────────────────────────────────────────────

export interface EventRetryConfig {
  /** Acknowledgment timeout in milliseconds */
  ackTimeoutMs: number;
  /** Maximum delivery retries before alerting */
  maxRetries: number;
}

// ─── Media Capture Limits ────────────────────────────────────────────────────

export interface MediaLimitsConfig {
  /** Maximum photo file size in bytes */
  photoMaxSizeBytes: number;
  /** Maximum video file size in bytes */
  videoMaxSizeBytes: number;
  /** Accepted photo formats */
  photoFormats: readonly string[];
  /** Accepted video formats */
  videoFormats: readonly string[];
  /** Number of required photos */
  requiredPhotos: number;
  /** Number of required videos */
  requiredVideos: number;
  /** Minimum video duration in seconds */
  videoMinDurationSeconds: number;
  /** Maximum video duration in seconds */
  videoMaxDurationSeconds: number;
  /** Maximum free-text reason length in characters */
  maxReasonTextLength: number;
}

// ─── Manual Review SLA ───────────────────────────────────────────────────────

export interface ManualReviewConfig {
  /** Maximum review timeframe in hours (shown to customer) */
  slaHours: number;
}

// ─── OTP (Identity Module) ───────────────────────────────────────────────────

export interface OtpConfig {
  /** Number of minutes before an OTP expires (default 10) */
  validityMinutes: number;
  /** Maximum incorrect OTP attempts before lockout (default 3) */
  maxAttempts: number;
  /** Number of minutes to lock a contact after exhausting attempts (default 15) */
  lockoutMinutes: number;
}

// ─── Resale Marketplace ──────────────────────────────────────────────────────

export interface ResaleConfig {
  /** Discount % off original price per grade (0–100). */
  gradeDiscountPct: { A: number; B: number; C: number };
  /** Local-buyer window in days for grades that support direct transfer (A & C). */
  transferWindowDays: number;
  /** Gift-card amount as % of original price for the Grade C keep-offer. */
  keepOfferGiftCardPct: number;
  /** ETA (hours) for a same-city direct transfer. */
  directTransferEtaHours: number;
  /** ETA (hours) for a warehouse-shipped resale order. */
  warehouseShipEtaHours: number;
  /** Default city assigned to the demo seller when no address is known. */
  defaultSellerCity: string;
  /** Additional % discount applied when a Grade B listing doesn't sell in time. */
  markdownPct: number;
  /** Window (days) re-opened after a Grade B markdown before the next markdown. */
  markdownWindowDays: number;
}

// ─── Return Abuse Guard ──────────────────────────────────────────────────────

export interface ReturnAbuseConfig {
  /** Recent-return count at which the customer starts seeing warnings. */
  warnThreshold: number;
  /** Recent-return count at which low-value returns are blocked. */
  blockThreshold: number;
  /** Products at or below this value are considered abuse-prone (cheap). */
  abuseProneMaxValue: number;
}

// ─── Root Config ─────────────────────────────────────────────────────────────

export interface AppConfig {
  returnWindow: ReturnWindowConfig;
  gradingTimeouts: GradingTimeoutsConfig;
  fraud: FraudConfig;
  dispositionThresholds: DispositionThresholdsConfig;
  refundPercentages: RefundPercentagesConfig;
  eventRetry: EventRetryConfig;
  mediaLimits: MediaLimitsConfig;
  manualReview: ManualReviewConfig;
  otp: OtpConfig;
  resale: ResaleConfig;
  returnAbuse: ReturnAbuseConfig;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: AppConfig = {
  returnWindow: {
    defaultDays: 10,
  },
  gradingTimeouts: {
    conditionGraderTimeoutMs: 90_000,
    identityVerifierTimeoutMs: 90_000,
    retryDelayMs: 3_000,
    maxRetries: 0,
  },
  fraud: {
    threshold: 0.7,
    unsupportedClaimIncrement: 0.15,
    historyWindowDays: 90,
  },
  dispositionThresholds: {
    lowConfidenceThreshold: 0.6,
    returnlessRefundMaxValue: 500,
    instantMatchRadiusKm: 25,
  },
  refundPercentages: {
    instant_match: 100,
    returnless_refund: 100,
    list_for_resale: 100,
    refurbishment: 80,
    donate_or_recycle: 0,
    manual_inspection: 60,
  },
  eventRetry: {
    ackTimeoutMs: 5_000,
    maxRetries: 3,
  },
  mediaLimits: {
    photoMaxSizeBytes: 10 * 1024 * 1024,       // 10 MB
    videoMaxSizeBytes: 50 * 1024 * 1024,       // 50 MB
    photoFormats: ['jpeg', 'png'] as const,
    videoFormats: ['mp4', 'mov'] as const,
    requiredPhotos: 3,
    requiredVideos: 1,
    videoMinDurationSeconds: 5,
    videoMaxDurationSeconds: 30,
    maxReasonTextLength: 500,
  },
  manualReview: {
    slaHours: 24,
  },
  otp: {
    validityMinutes: 10,
    maxAttempts: 3,
    lockoutMinutes: 15,
  },
  resale: {
    gradeDiscountPct: { A: 0, B: 25, C: 40 },
    transferWindowDays: 4,
    keepOfferGiftCardPct: 30,
    directTransferEtaHours: 4,
    warehouseShipEtaHours: 72,
    defaultSellerCity: 'Bengaluru',
    markdownPct: 15,
    markdownWindowDays: 4,
  },
  returnAbuse: {
    warnThreshold: 3,
    blockThreshold: 5,
    abuseProneMaxValue: 500,
  },
};

// ─── Environment Variable Loader ─────────────────────────────────────────────

function envNumber(key: string): number | undefined {
  const val = process.env[key];
  if (val === undefined || val === '') return undefined;
  const parsed = Number(val);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function envStringArray(key: string): string[] | undefined {
  const val = process.env[key];
  if (val === undefined || val === '') return undefined;
  return val.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Load configuration from environment variables with fallback to defaults.
 *
 * Environment variable naming convention:
 *   ZTR_<SECTION>_<PARAM>
 *
 * Examples:
 *   ZTR_FRAUD_THRESHOLD=0.85
 *   ZTR_DISPOSITION_RETURNLESS_MAX_VALUE=1000
 *   ZTR_MEDIA_PHOTO_FORMATS=jpeg,png,webp
 */
export function loadConfig(): AppConfig {
  return {
    returnWindow: {
      defaultDays:
        envNumber('ZTR_RETURN_WINDOW_DEFAULT_DAYS')
        ?? DEFAULT_CONFIG.returnWindow.defaultDays,
    },
    gradingTimeouts: {
      conditionGraderTimeoutMs:
        envNumber('ZTR_GRADING_CONDITION_TIMEOUT_MS')
        ?? DEFAULT_CONFIG.gradingTimeouts.conditionGraderTimeoutMs,
      identityVerifierTimeoutMs:
        envNumber('ZTR_GRADING_IDENTITY_TIMEOUT_MS')
        ?? DEFAULT_CONFIG.gradingTimeouts.identityVerifierTimeoutMs,
      retryDelayMs:
        envNumber('ZTR_GRADING_RETRY_DELAY_MS')
        ?? DEFAULT_CONFIG.gradingTimeouts.retryDelayMs,
      maxRetries:
        envNumber('ZTR_GRADING_MAX_RETRIES')
        ?? DEFAULT_CONFIG.gradingTimeouts.maxRetries,
    },
    fraud: {
      threshold:
        envNumber('ZTR_FRAUD_THRESHOLD')
        ?? DEFAULT_CONFIG.fraud.threshold,
      unsupportedClaimIncrement:
        envNumber('ZTR_FRAUD_UNSUPPORTED_CLAIM_INCREMENT')
        ?? DEFAULT_CONFIG.fraud.unsupportedClaimIncrement,
      historyWindowDays:
        envNumber('ZTR_FRAUD_HISTORY_WINDOW_DAYS')
        ?? DEFAULT_CONFIG.fraud.historyWindowDays,
    },
    dispositionThresholds: {
      lowConfidenceThreshold:
        envNumber('ZTR_DISPOSITION_LOW_CONFIDENCE_THRESHOLD')
        ?? DEFAULT_CONFIG.dispositionThresholds.lowConfidenceThreshold,
      returnlessRefundMaxValue:
        envNumber('ZTR_DISPOSITION_RETURNLESS_MAX_VALUE')
        ?? DEFAULT_CONFIG.dispositionThresholds.returnlessRefundMaxValue,
      instantMatchRadiusKm:
        envNumber('ZTR_DISPOSITION_INSTANT_MATCH_RADIUS_KM')
        ?? DEFAULT_CONFIG.dispositionThresholds.instantMatchRadiusKm,
    },
    refundPercentages: {
      instant_match:
        envNumber('ZTR_REFUND_INSTANT_MATCH')
        ?? DEFAULT_CONFIG.refundPercentages.instant_match,
      returnless_refund:
        envNumber('ZTR_REFUND_RETURNLESS_REFUND')
        ?? DEFAULT_CONFIG.refundPercentages.returnless_refund,
      list_for_resale:
        envNumber('ZTR_REFUND_LIST_FOR_RESALE')
        ?? DEFAULT_CONFIG.refundPercentages.list_for_resale,
      refurbishment:
        envNumber('ZTR_REFUND_REFURBISHMENT')
        ?? DEFAULT_CONFIG.refundPercentages.refurbishment,
      donate_or_recycle:
        envNumber('ZTR_REFUND_DONATE_OR_RECYCLE')
        ?? DEFAULT_CONFIG.refundPercentages.donate_or_recycle,
      manual_inspection:
        envNumber('ZTR_REFUND_MANUAL_INSPECTION')
        ?? DEFAULT_CONFIG.refundPercentages.manual_inspection,
    },
    eventRetry: {
      ackTimeoutMs:
        envNumber('ZTR_EVENT_RETRY_ACK_TIMEOUT_MS')
        ?? DEFAULT_CONFIG.eventRetry.ackTimeoutMs,
      maxRetries:
        envNumber('ZTR_EVENT_RETRY_MAX_RETRIES')
        ?? DEFAULT_CONFIG.eventRetry.maxRetries,
    },
    mediaLimits: {
      photoMaxSizeBytes:
        envNumber('ZTR_MEDIA_PHOTO_MAX_SIZE_BYTES')
        ?? DEFAULT_CONFIG.mediaLimits.photoMaxSizeBytes,
      videoMaxSizeBytes:
        envNumber('ZTR_MEDIA_VIDEO_MAX_SIZE_BYTES')
        ?? DEFAULT_CONFIG.mediaLimits.videoMaxSizeBytes,
      photoFormats:
        envStringArray('ZTR_MEDIA_PHOTO_FORMATS')
        ?? DEFAULT_CONFIG.mediaLimits.photoFormats,
      videoFormats:
        envStringArray('ZTR_MEDIA_VIDEO_FORMATS')
        ?? DEFAULT_CONFIG.mediaLimits.videoFormats,
      requiredPhotos:
        envNumber('ZTR_MEDIA_REQUIRED_PHOTOS')
        ?? DEFAULT_CONFIG.mediaLimits.requiredPhotos,
      requiredVideos:
        envNumber('ZTR_MEDIA_REQUIRED_VIDEOS')
        ?? DEFAULT_CONFIG.mediaLimits.requiredVideos,
      videoMinDurationSeconds:
        envNumber('ZTR_MEDIA_VIDEO_MIN_DURATION_SEC')
        ?? DEFAULT_CONFIG.mediaLimits.videoMinDurationSeconds,
      videoMaxDurationSeconds:
        envNumber('ZTR_MEDIA_VIDEO_MAX_DURATION_SEC')
        ?? DEFAULT_CONFIG.mediaLimits.videoMaxDurationSeconds,
      maxReasonTextLength:
        envNumber('ZTR_MEDIA_MAX_REASON_TEXT_LENGTH')
        ?? DEFAULT_CONFIG.mediaLimits.maxReasonTextLength,
    },
    manualReview: {
      slaHours:
        envNumber('ZTR_MANUAL_REVIEW_SLA_HOURS')
        ?? DEFAULT_CONFIG.manualReview.slaHours,
    },
    otp: {
      validityMinutes:
        envNumber('ZTR_OTP_VALIDITY_MINUTES')
        ?? DEFAULT_CONFIG.otp.validityMinutes,
      maxAttempts:
        envNumber('ZTR_OTP_MAX_ATTEMPTS')
        ?? DEFAULT_CONFIG.otp.maxAttempts,
      lockoutMinutes:
        envNumber('ZTR_OTP_LOCKOUT_MINUTES')
        ?? DEFAULT_CONFIG.otp.lockoutMinutes,
    },
    resale: {
      gradeDiscountPct: {
        A: envNumber('ZTR_RESALE_DISCOUNT_A') ?? DEFAULT_CONFIG.resale.gradeDiscountPct.A,
        B: envNumber('ZTR_RESALE_DISCOUNT_B') ?? DEFAULT_CONFIG.resale.gradeDiscountPct.B,
        C: envNumber('ZTR_RESALE_DISCOUNT_C') ?? DEFAULT_CONFIG.resale.gradeDiscountPct.C,
      },
      transferWindowDays:
        envNumber('ZTR_RESALE_TRANSFER_WINDOW_DAYS')
        ?? DEFAULT_CONFIG.resale.transferWindowDays,
      keepOfferGiftCardPct:
        envNumber('ZTR_RESALE_KEEP_OFFER_GIFTCARD_PCT')
        ?? DEFAULT_CONFIG.resale.keepOfferGiftCardPct,
      directTransferEtaHours:
        envNumber('ZTR_RESALE_DIRECT_TRANSFER_ETA_HOURS')
        ?? DEFAULT_CONFIG.resale.directTransferEtaHours,
      warehouseShipEtaHours:
        envNumber('ZTR_RESALE_WAREHOUSE_SHIP_ETA_HOURS')
        ?? DEFAULT_CONFIG.resale.warehouseShipEtaHours,
      defaultSellerCity:
        process.env['ZTR_RESALE_DEFAULT_SELLER_CITY']
        ?? DEFAULT_CONFIG.resale.defaultSellerCity,
      markdownPct:
        envNumber('ZTR_RESALE_MARKDOWN_PCT')
        ?? DEFAULT_CONFIG.resale.markdownPct,
      markdownWindowDays:
        envNumber('ZTR_RESALE_MARKDOWN_WINDOW_DAYS')
        ?? DEFAULT_CONFIG.resale.markdownWindowDays,
    },
    returnAbuse: {
      warnThreshold:
        envNumber('ZTR_RETURN_ABUSE_WARN_THRESHOLD')
        ?? DEFAULT_CONFIG.returnAbuse.warnThreshold,
      blockThreshold:
        envNumber('ZTR_RETURN_ABUSE_BLOCK_THRESHOLD')
        ?? DEFAULT_CONFIG.returnAbuse.blockThreshold,
      abuseProneMaxValue:
        envNumber('ZTR_RETURN_ABUSE_PRONE_MAX_VALUE')
        ?? DEFAULT_CONFIG.returnAbuse.abuseProneMaxValue,
    },
  };
}

/**
 * Singleton config instance. Call initializeConfig() at startup,
 * or use getConfig() to get the cached instance with defaults.
 */
let _configInstance: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_configInstance) {
    _configInstance = loadConfig();
  }
  return _configInstance;
}

export function resetConfig(): void {
  _configInstance = null;
}

export function initializeConfig(): AppConfig {
  _configInstance = loadConfig();
  return _configInstance;
}
