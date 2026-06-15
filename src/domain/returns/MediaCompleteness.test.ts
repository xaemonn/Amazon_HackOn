/**
 * Tests for the MediaCompleteness value object.
 *
 * Covers:
 * - validateSingleMedia: all valid format/size combos pass; bad format fails; oversized fails
 * - checkMediaCompleteness: complete set passes; missing slots; missing video;
 *   wrong format; oversized; duplicate slots; combined issues
 *
 * Requirements: 3.1, 3.6, 3.8
 */

import { describe, it, expect } from 'vitest';
import type { MediaReference } from '../shared/types.js';
import {
  PHOTO_MAX_SIZE_BYTES,
  VIDEO_MAX_SIZE_BYTES,
  validateSingleMedia,
  checkMediaCompleteness,
  MediaValidationError,
} from './MediaCompleteness.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePhoto(
  type: 'photo_front' | 'photo_back' | 'photo_closeup',
  overrides: Partial<MediaReference> = {},
): MediaReference {
  return {
    id: `${type}-1`,
    type,
    storageKey: `uploads/${type}.jpg`,
    format: 'jpeg',
    sizeBytes: 1024 * 1024, // 1 MB
    capturedAt: new Date(),
    ...overrides,
  };
}

function makeVideo(overrides: Partial<MediaReference> = {}): MediaReference {
  return {
    id: 'video-1',
    type: 'video',
    storageKey: 'uploads/video.mp4',
    format: 'mp4',
    sizeBytes: 10 * 1024 * 1024, // 10 MB
    capturedAt: new Date(),
    ...overrides,
  };
}

/** A complete, valid media set. */
function completeValidSet(): MediaReference[] {
  return [
    makePhoto('photo_front'),
    makePhoto('photo_back'),
    makePhoto('photo_closeup'),
    makeVideo(),
  ];
}

// ─── validateSingleMedia ──────────────────────────────────────────────────────

describe('validateSingleMedia', () => {
  describe('photos — valid formats and sizes', () => {
    it('accepts JPEG photo within size limit', () => {
      expect(validateSingleMedia(makePhoto('photo_front', { format: 'jpeg' }))).toEqual([]);
    });

    it('accepts PNG photo within size limit', () => {
      expect(validateSingleMedia(makePhoto('photo_back', { format: 'png' }))).toEqual([]);
    });

    it('accepts photo at exactly 10 MB', () => {
      expect(validateSingleMedia(makePhoto('photo_closeup', { sizeBytes: PHOTO_MAX_SIZE_BYTES }))).toEqual([]);
    });
  });

  describe('photos — invalid format', () => {
    it('rejects a photo_front with mp4 format', () => {
      const issues = validateSingleMedia(
        makePhoto('photo_front', { format: 'mp4' as MediaReference['format'] }),
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('Photo front');
      expect(issues[0]).toContain('JPEG or PNG');
    });

    it('rejects a photo_back with mov format', () => {
      const issues = validateSingleMedia(
        makePhoto('photo_back', { format: 'mov' as MediaReference['format'] }),
      );
      expect(issues[0]).toContain('Photo back');
    });

    it('rejects a photo_closeup with invalid format', () => {
      const issues = validateSingleMedia(
        makePhoto('photo_closeup', { format: 'mp4' as MediaReference['format'] }),
      );
      expect(issues[0]).toContain('Photo close-up');
    });
  });

  describe('photos — oversized', () => {
    it('rejects a photo exceeding 10 MB', () => {
      const issues = validateSingleMedia(
        makePhoto('photo_front', { sizeBytes: PHOTO_MAX_SIZE_BYTES + 1 }),
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('Photo front');
      expect(issues[0]).toContain('10 MB');
    });
  });

  describe('photos — bad format AND oversized', () => {
    it('reports both issues', () => {
      const issues = validateSingleMedia(
        makePhoto('photo_front', {
          format: 'mp4' as MediaReference['format'],
          sizeBytes: PHOTO_MAX_SIZE_BYTES + 1,
        }),
      );
      expect(issues).toHaveLength(2);
    });
  });

  describe('video — valid formats and sizes', () => {
    it('accepts MP4 video within size limit', () => {
      expect(validateSingleMedia(makeVideo({ format: 'mp4' }))).toEqual([]);
    });

    it('accepts MOV video within size limit', () => {
      expect(validateSingleMedia(makeVideo({ format: 'mov' }))).toEqual([]);
    });

    it('accepts video at exactly 50 MB', () => {
      expect(validateSingleMedia(makeVideo({ sizeBytes: VIDEO_MAX_SIZE_BYTES }))).toEqual([]);
    });
  });

  describe('video — invalid format', () => {
    it('rejects video with jpeg format', () => {
      const issues = validateSingleMedia(
        makeVideo({ format: 'jpeg' as MediaReference['format'] }),
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('Video');
      expect(issues[0]).toContain('MP4 or MOV');
    });
  });

  describe('video — oversized', () => {
    it('rejects video exceeding 50 MB', () => {
      const issues = validateSingleMedia(makeVideo({ sizeBytes: VIDEO_MAX_SIZE_BYTES + 1 }));
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('Video');
      expect(issues[0]).toContain('50 MB');
    });
  });
});

// ─── checkMediaCompleteness ───────────────────────────────────────────────────

describe('checkMediaCompleteness', () => {
  describe('complete valid set', () => {
    it('returns complete=true with no missing slots or issues', () => {
      const result = checkMediaCompleteness(completeValidSet());
      expect(result.complete).toBe(true);
      expect(result.missingSlots).toHaveLength(0);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('empty set', () => {
    it('reports all 3 photo slots as missing', () => {
      const result = checkMediaCompleteness([]);
      expect(result.complete).toBe(false);
      expect(result.missingSlots).toHaveLength(3); // front, back, closeup (video no longer required)
    });
  });

  describe('missing individual photo slot', () => {
    it('reports missing photo_front', () => {
      const media = completeValidSet().filter((m) => m.type !== 'photo_front');
      const result = checkMediaCompleteness(media);
      expect(result.complete).toBe(false);
      expect(result.missingSlots.some((s) => s.includes('Photo front'))).toBe(true);
    });

    it('reports missing photo_back', () => {
      const media = completeValidSet().filter((m) => m.type !== 'photo_back');
      const result = checkMediaCompleteness(media);
      expect(result.missingSlots.some((s) => s.includes('Photo back'))).toBe(true);
    });

    it('reports missing photo_closeup', () => {
      const media = completeValidSet().filter((m) => m.type !== 'photo_closeup');
      const result = checkMediaCompleteness(media);
      expect(result.missingSlots.some((s) => s.includes('Photo close-up'))).toBe(true);
    });
  });

  describe('video is optional', () => {
    it('is complete with only the 3 photos and no video', () => {
      const media = completeValidSet().filter((m) => m.type !== 'video');
      const result = checkMediaCompleteness(media);
      expect(result.complete).toBe(true);
      expect(result.missingSlots).toHaveLength(0);
    });
  });

  describe('duplicate slots', () => {
    it('reports duplicate photo_front', () => {
      const media = [
        ...completeValidSet(),
        makePhoto('photo_front', { id: 'photo_front-2' }),
      ];
      const result = checkMediaCompleteness(media);
      expect(result.complete).toBe(false);
      expect(result.missingSlots.some((s) => s.includes('Photo front') && s.includes('duplicate'))).toBe(true);
    });

    it('ignores extra videos (video no longer a tracked slot)', () => {
      const media = [...completeValidSet(), makeVideo({ id: 'video-2' })];
      const result = checkMediaCompleteness(media);
      expect(result.complete).toBe(true);
      expect(result.missingSlots).toHaveLength(0);
    });
  });

  describe('format violations', () => {
    it('reports complete=false when a photo has wrong format', () => {
      const media = completeValidSet();
      // Replace front photo with an invalid format
      const idx = media.findIndex((m) => m.type === 'photo_front');
      media[idx] = makePhoto('photo_front', { format: 'mp4' as MediaReference['format'] });

      const result = checkMediaCompleteness(media);
      expect(result.complete).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.includes('Photo front') && i.includes('JPEG or PNG'))).toBe(true);
    });

    it('reports complete=false when video has wrong format', () => {
      const media = completeValidSet();
      const idx = media.findIndex((m) => m.type === 'video');
      media[idx] = makeVideo({ format: 'jpeg' as MediaReference['format'] });

      const result = checkMediaCompleteness(media);
      expect(result.complete).toBe(false);
      expect(result.issues.some((i) => i.includes('Video') && i.includes('MP4 or MOV'))).toBe(true);
    });
  });

  describe('size violations', () => {
    it('reports complete=false when a photo exceeds 10 MB', () => {
      const media = completeValidSet();
      const idx = media.findIndex((m) => m.type === 'photo_back');
      media[idx] = makePhoto('photo_back', { sizeBytes: PHOTO_MAX_SIZE_BYTES + 1 });

      const result = checkMediaCompleteness(media);
      expect(result.complete).toBe(false);
      expect(result.issues.some((i) => i.includes('Photo back') && i.includes('10 MB'))).toBe(true);
    });

    it('reports complete=false when video exceeds 50 MB', () => {
      const media = completeValidSet();
      const idx = media.findIndex((m) => m.type === 'video');
      media[idx] = makeVideo({ sizeBytes: VIDEO_MAX_SIZE_BYTES + 1 });

      const result = checkMediaCompleteness(media);
      expect(result.complete).toBe(false);
      expect(result.issues.some((i) => i.includes('Video') && i.includes('50 MB'))).toBe(true);
    });
  });

  describe('combined issues', () => {
    it('reports both missing slots and format issues', () => {
      // Only 2 photos — missing photo_back; front photo has wrong format
      const media: MediaReference[] = [
        makePhoto('photo_front', { format: 'mp4' as MediaReference['format'] }),
        makePhoto('photo_closeup'),
        makeVideo(),
      ];
      const result = checkMediaCompleteness(media);
      expect(result.complete).toBe(false);
      expect(result.missingSlots.some((s) => s.includes('Photo back'))).toBe(true);
      expect(result.issues.some((i) => i.includes('Photo front'))).toBe(true);
    });
  });
});

describe('MediaValidationError', () => {
  it('is an instance of Error', () => {
    const err = new MediaValidationError(['Photo front: format must be JPEG or PNG']);
    expect(err).toBeInstanceOf(Error);
  });

  it('exposes the issues array', () => {
    const issues = ['issue 1', 'issue 2'];
    const err = new MediaValidationError(issues);
    expect(err.issues).toEqual(issues);
  });

  it('has the name MediaValidationError', () => {
    const err = new MediaValidationError([]);
    expect(err.name).toBe('MediaValidationError');
  });
});
