import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DEFAULT_CONFIG, loadConfig } from './index';

describe('AppConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('DEFAULT_CONFIG', () => {
    it('has correct return window default', () => {
      expect(DEFAULT_CONFIG.returnWindow.defaultDays).toBe(10);
    });

    it('has correct grading timeouts', () => {
      expect(DEFAULT_CONFIG.gradingTimeouts.conditionGraderTimeoutMs).toBe(10_000);
      expect(DEFAULT_CONFIG.gradingTimeouts.identityVerifierTimeoutMs).toBe(5_000);
      expect(DEFAULT_CONFIG.gradingTimeouts.retryDelayMs).toBe(2_000);
      expect(DEFAULT_CONFIG.gradingTimeouts.maxRetries).toBe(1);
    });

    it('has correct fraud defaults', () => {
      expect(DEFAULT_CONFIG.fraud.threshold).toBe(0.7);
      expect(DEFAULT_CONFIG.fraud.unsupportedClaimIncrement).toBe(0.15);
    });

    it('has correct disposition thresholds', () => {
      expect(DEFAULT_CONFIG.dispositionThresholds.lowConfidenceThreshold).toBe(0.6);
      expect(DEFAULT_CONFIG.dispositionThresholds.returnlessRefundMaxValue).toBe(500);
      expect(DEFAULT_CONFIG.dispositionThresholds.instantMatchRadiusKm).toBe(25);
    });

    it('has correct refund percentages', () => {
      expect(DEFAULT_CONFIG.refundPercentages.instant_match).toBe(100);
      expect(DEFAULT_CONFIG.refundPercentages.returnless_refund).toBe(100);
      expect(DEFAULT_CONFIG.refundPercentages.list_for_resale).toBe(100);
      expect(DEFAULT_CONFIG.refundPercentages.refurbishment).toBe(80);
      expect(DEFAULT_CONFIG.refundPercentages.donate_or_recycle).toBe(0);
      expect(DEFAULT_CONFIG.refundPercentages.manual_inspection).toBe(60);
    });

    it('has correct event retry settings', () => {
      expect(DEFAULT_CONFIG.eventRetry.ackTimeoutMs).toBe(5_000);
      expect(DEFAULT_CONFIG.eventRetry.maxRetries).toBe(3);
    });

    it('has correct media limits', () => {
      expect(DEFAULT_CONFIG.mediaLimits.photoMaxSizeBytes).toBe(10 * 1024 * 1024);
      expect(DEFAULT_CONFIG.mediaLimits.videoMaxSizeBytes).toBe(50 * 1024 * 1024);
      expect(DEFAULT_CONFIG.mediaLimits.photoFormats).toEqual(['jpeg', 'png']);
      expect(DEFAULT_CONFIG.mediaLimits.videoFormats).toEqual(['mp4', 'mov']);
      expect(DEFAULT_CONFIG.mediaLimits.requiredPhotos).toBe(3);
      expect(DEFAULT_CONFIG.mediaLimits.requiredVideos).toBe(1);
      expect(DEFAULT_CONFIG.mediaLimits.videoMinDurationSeconds).toBe(5);
      expect(DEFAULT_CONFIG.mediaLimits.videoMaxDurationSeconds).toBe(30);
    });

    it('has correct manual review SLA', () => {
      expect(DEFAULT_CONFIG.manualReview.slaHours).toBe(24);
    });
  });

  describe('loadConfig()', () => {
    it('returns defaults when no environment variables are set', () => {
      const config = loadConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('overrides numeric values from environment variables', () => {
      process.env['ZTR_FRAUD_THRESHOLD'] = '0.85';
      process.env['ZTR_DISPOSITION_RETURNLESS_MAX_VALUE'] = '1000';
      process.env['ZTR_RETURN_WINDOW_DEFAULT_DAYS'] = '14';

      const config = loadConfig();

      expect(config.fraud.threshold).toBe(0.85);
      expect(config.dispositionThresholds.returnlessRefundMaxValue).toBe(1000);
      expect(config.returnWindow.defaultDays).toBe(14);
    });

    it('overrides string array values from environment variables', () => {
      process.env['ZTR_MEDIA_PHOTO_FORMATS'] = 'jpeg,png,webp';

      const config = loadConfig();

      expect(config.mediaLimits.photoFormats).toEqual(['jpeg', 'png', 'webp']);
    });

    it('ignores invalid numeric environment variables and uses defaults', () => {
      process.env['ZTR_FRAUD_THRESHOLD'] = 'not-a-number';

      const config = loadConfig();

      expect(config.fraud.threshold).toBe(0.7);
    });

    it('ignores empty environment variables and uses defaults', () => {
      process.env['ZTR_FRAUD_THRESHOLD'] = '';

      const config = loadConfig();

      expect(config.fraud.threshold).toBe(0.7);
    });

    it('partially overrides — unset values keep defaults', () => {
      process.env['ZTR_GRADING_CONDITION_TIMEOUT_MS'] = '15000';

      const config = loadConfig();

      expect(config.gradingTimeouts.conditionGraderTimeoutMs).toBe(15_000);
      expect(config.gradingTimeouts.identityVerifierTimeoutMs).toBe(5_000); // still default
      expect(config.gradingTimeouts.retryDelayMs).toBe(2_000); // still default
    });
  });
});
