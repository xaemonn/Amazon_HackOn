/**
 * MediaCompleteness value object.
 *
 * Validates individual media items and checks whether a set of media
 * references satisfies the guided-capture requirements:
 *   - Exactly 1 photo_front, 1 photo_back, 1 photo_closeup (JPEG/PNG ≤ 10 MB each)
 *   - Exactly 1 video (MP4/MOV ≤ 50 MB)
 *
 * Requirements: 3.1, 3.6, 3.8
 */

import type { MediaReference } from '../shared/types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum size in bytes for a single photo (10 MB). Requirement 3.8 */
export const PHOTO_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum size in bytes for the video (50 MB). Requirement 3.8 */
export const VIDEO_MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** Accepted photo formats. Requirement 3.8 */
export const VALID_PHOTO_FORMATS: readonly string[] = ['jpeg', 'png'];

/** Accepted video formats. Requirement 3.8 */
export const VALID_VIDEO_FORMATS: readonly string[] = ['mp4', 'mov'];

/** Photo slot types that must each be present exactly once. Requirement 3.1 */
export const REQUIRED_PHOTO_TYPES: readonly string[] = [
  'photo_front',
  'photo_back',
  'photo_closeup',
];

// ─── Error class ──────────────────────────────────────────────────────────────

/**
 * Thrown when one or more media items fail format or size validation.
 */
export class MediaValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Media validation failed: ${issues.join('; ')}`);
    this.name = 'MediaValidationError';
    this.issues = issues;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Single-media validator ───────────────────────────────────────────────────

/**
 * Validate a single MediaReference for format and size compliance.
 *
 * @param media - The media reference to validate.
 * @returns Array of user-friendly issue strings. Empty array means valid.
 *
 * Requirement 3.8
 */
export function validateSingleMedia(media: MediaReference): string[] {
  const issues: string[] = [];
  const isPhoto = media.type !== 'video';

  if (isPhoto) {
    // Format check
    if (!VALID_PHOTO_FORMATS.includes(media.format)) {
      const label = photoTypeLabel(media.type);
      issues.push(`${label}: format must be JPEG or PNG`);
    }
    // Size check
    if (media.sizeBytes > PHOTO_MAX_SIZE_BYTES) {
      const label = photoTypeLabel(media.type);
      issues.push(`${label}: size must not exceed 10 MB`);
    }
  } else {
    // Format check
    if (!VALID_VIDEO_FORMATS.includes(media.format)) {
      issues.push('Video: format must be MP4 or MOV');
    }
    // Size check
    if (media.sizeBytes > VIDEO_MAX_SIZE_BYTES) {
      issues.push('Video: size must not exceed 50 MB');
    }
  }

  return issues;
}

// ─── Completeness check ───────────────────────────────────────────────────────

/**
 * Result of a media completeness check.
 */
export interface MediaCompletenessResult {
  /** True only when all required slots are filled and no format/size issues exist. */
  complete: boolean;
  /** Human-readable labels for slots that are absent or duplicated. */
  missingSlots: string[];
  /** User-friendly format/size issue messages from validateSingleMedia. */
  issues: string[];
}

/**
 * Check whether a collection of media references satisfies the guided-capture
 * requirements (3 photos + 1 video, each valid format and size).
 *
 * A slot is considered "missing" if zero items occupy it, and "duplicate" if
 * more than one item claims the same type — both are reported in missingSlots
 * with a distinguishing label.
 *
 * @param media - Array of MediaReferences to evaluate.
 * @returns A MediaCompletenessResult with complete flag, missing slots, and issues.
 *
 * Requirements: 3.1, 3.6, 3.8
 */
export function checkMediaCompleteness(media: MediaReference[]): MediaCompletenessResult {
  const missingSlots: string[] = [];
  const issues: string[] = [];

  // ── Check each required photo type ──────────────────────────────────────────
  for (const photoType of REQUIRED_PHOTO_TYPES) {
    const matches = media.filter((m) => m.type === photoType);
    if (matches.length === 0) {
      missingSlots.push(`${photoTypeLabel(photoType as MediaReference['type'])}: missing`);
    } else if (matches.length > 1) {
      missingSlots.push(`${photoTypeLabel(photoType as MediaReference['type'])}: duplicate (expected exactly 1)`);
    }
  }

  // ── Check video slot ─────────────────────────────────────────────────────────
  const videos = media.filter((m) => m.type === 'video');
  if (videos.length === 0) {
    missingSlots.push('Video: missing');
  } else if (videos.length > 1) {
    missingSlots.push('Video: duplicate (expected exactly 1)');
  }

  // ── Validate each media item ─────────────────────────────────────────────────
  for (const item of media) {
    const itemIssues = validateSingleMedia(item);
    issues.push(...itemIssues);
  }

  const complete = missingSlots.length === 0 && issues.length === 0;

  return { complete, missingSlots, issues };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a media type code to a human-readable label for use in error messages.
 */
function photoTypeLabel(type: MediaReference['type'] | string): string {
  switch (type) {
    case 'photo_front':
      return 'Photo front';
    case 'photo_back':
      return 'Photo back';
    case 'photo_closeup':
      return 'Photo close-up';
    case 'video':
      return 'Video';
    default:
      return String(type);
  }
}
