/**
 * Unit tests for MockReasonParser — keyword-based reason parser and reconciler.
 *
 * Validates:
 * - Keyword extraction for each claim type
 * - Reconciliation logic (supported, unsupported, inconclusive verdicts)
 * - Overall status computation (aligns, partially_aligns, contradicts, unparseable)
 * - Edge cases (empty text, no keywords, multiple keywords from same group)
 *
 * Validates: Requirements 16.3, 16.6
 */

import { describe, it, expect } from 'vitest';
import { MockReasonParser } from './MockReasonParser.js';
import type { Defect } from '../../domain/shared/types.js';

describe('MockReasonParser', () => {
  const parser = new MockReasonParser();

  describe('keyword extraction — claim types', () => {
    it('should extract damage_description claim for "cracked"', async () => {
      const result = await parser.parseAndReconcile('The screen is cracked', []);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('damage_description');
      expect(result.claims[0].itemArea).toBe('screen');
    });

    it('should extract damage_description claim for "broken"', async () => {
      const result = await parser.parseAndReconcile('The item arrived broken', []);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('damage_description');
      expect(result.claims[0].itemArea).toBe('screen');
    });

    it('should extract missing_component claim for "missing"', async () => {
      const result = await parser.parseAndReconcile('Charger is missing from box', []);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('missing_component');
      expect(result.claims[0].itemArea).toBe('accessory');
    });

    it('should extract cosmetic_issue claim for "scratched"', async () => {
      const result = await parser.parseAndReconcile('Surface is scratched all over', []);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('cosmetic_issue');
      expect(result.claims[0].itemArea).toBe('surface');
    });

    it('should extract functional_defect claim for "not working"', async () => {
      const result = await parser.parseAndReconcile('The device is not working', []);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('functional_defect');
      expect(result.claims[0].itemArea).toBe('device');
    });

    it('should extract damage_description claim for "dented"', async () => {
      const result = await parser.parseAndReconcile('The body is dented', []);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('damage_description');
      expect(result.claims[0].itemArea).toBe('body');
    });

    it('should extract functional_defect claim for "loose"', async () => {
      const result = await parser.parseAndReconcile('Something is loose inside', []);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('functional_defect');
      expect(result.claims[0].itemArea).toBe('internal');
    });

    it('should extract cosmetic_issue claim for "stained"', async () => {
      const result = await parser.parseAndReconcile('There is a stained area', []);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('cosmetic_issue');
      expect(result.claims[0].itemArea).toBe('exterior');
    });

    it('should extract damage_description claim for "chipped"', async () => {
      const result = await parser.parseAndReconcile('The edge is chipped', []);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('damage_description');
      expect(result.claims[0].itemArea).toBe('edge');
    });
  });

  describe('multiple claims extraction', () => {
    it('should extract multiple claims from text with multiple keywords', async () => {
      const result = await parser.parseAndReconcile(
        'The screen is cracked and charger is missing',
        [],
      );
      expect(result.claims.length).toBeGreaterThanOrEqual(2);
      const types = result.claims.map((c) => c.claimType);
      expect(types).toContain('damage_description');
      expect(types).toContain('missing_component');
    });

    it('should not duplicate claims when multiple keywords from same group appear', async () => {
      // "cracked" and "broken" are in the same group
      const result = await parser.parseAndReconcile(
        'It is cracked and broken',
        [],
      );
      const damageClaims = result.claims.filter(
        (c) => c.claimType === 'damage_description' && c.itemArea === 'screen',
      );
      expect(damageClaims).toHaveLength(1);
    });
  });

  describe('reconciliation — verdict determination', () => {
    it('should return inconclusive verdict when defects array is empty', async () => {
      const result = await parser.parseAndReconcile('The screen is cracked', []);
      expect(result.claims[0].verdict).toBe('inconclusive');
    });

    it('should return supported verdict when defect location matches claim area', async () => {
      const defects: Defect[] = [
        { location: 'screen', severity: 'severe', description: 'Cracked screen' },
      ];
      const result = await parser.parseAndReconcile('The screen is cracked', defects);
      expect(result.claims[0].verdict).toBe('supported');
    });

    it('should return unsupported verdict when defects exist but none match', async () => {
      const defects: Defect[] = [
        { location: 'bottom-left corner', severity: 'minor', description: 'Scuff mark' },
      ];
      const result = await parser.parseAndReconcile('The screen is cracked', defects);
      expect(result.claims[0].verdict).toBe('unsupported');
    });

    it('should support claims when defect location contains claim area', async () => {
      const defects: Defect[] = [
        { location: 'internal bracket', severity: 'severe', description: 'Loose component' },
      ];
      const result = await parser.parseAndReconcile('Something is loose inside', defects);
      expect(result.claims[0].verdict).toBe('supported');
    });
  });

  describe('overall status computation', () => {
    it('should return "aligns" when all claims are supported', async () => {
      const defects: Defect[] = [
        { location: 'screen panel', severity: 'severe', description: 'Cracked display' },
      ];
      const result = await parser.parseAndReconcile('The screen is cracked', defects);
      expect(result.status).toBe('aligns');
    });

    it('should return "contradicts" when no supported claims and at least one unsupported', async () => {
      const defects: Defect[] = [
        { location: 'bottom-left corner', severity: 'minor', description: 'Unrelated scuff' },
      ];
      const result = await parser.parseAndReconcile('The screen is cracked', defects);
      expect(result.status).toBe('contradicts');
    });

    it('should return "partially_aligns" when all claims are inconclusive', async () => {
      const result = await parser.parseAndReconcile('The screen is cracked', []);
      expect(result.status).toBe('partially_aligns');
    });

    it('should return "partially_aligns" when mix of supported and unsupported', async () => {
      const defects: Defect[] = [
        { location: 'screen', severity: 'severe', description: 'Crack on screen' },
      ];
      // "cracked" matches screen defect (supported), "missing" doesn't (unsupported)
      const result = await parser.parseAndReconcile(
        'The screen is cracked and charger is missing',
        defects,
      );
      expect(result.status).toBe('partially_aligns');
    });

    it('should return "unparseable" when text is empty', async () => {
      const result = await parser.parseAndReconcile('', []);
      expect(result.status).toBe('unparseable');
      expect(result.claims).toHaveLength(0);
    });

    it('should return "unparseable" when text is whitespace-only', async () => {
      const result = await parser.parseAndReconcile('   \t\n  ', []);
      expect(result.status).toBe('unparseable');
      expect(result.claims).toHaveLength(0);
    });

    it('should return "unparseable" when no keywords match', async () => {
      const result = await parser.parseAndReconcile('I just want a refund thanks', []);
      expect(result.status).toBe('unparseable');
      expect(result.claims).toHaveLength(0);
    });
  });

  describe('rawText preservation', () => {
    it('should preserve the original free-text in the result', async () => {
      const text = 'The screen is cracked badly';
      const result = await parser.parseAndReconcile(text, []);
      expect(result.rawText).toBe(text);
    });
  });

  describe('case insensitivity', () => {
    it('should match keywords regardless of case', async () => {
      const result = await parser.parseAndReconcile('The Screen Is CRACKED', []);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('damage_description');
    });
  });

  describe('parseReason method (dedicated interface)', () => {
    it('should delegate to parseAndReconcile correctly', async () => {
      const defects: Defect[] = [
        { location: 'screen', severity: 'severe', description: 'Crack' },
      ];
      const result = await parser.parseReason('The screen is cracked', defects, 'product-123');
      expect(result.status).toBe('aligns');
      expect(result.claims).toHaveLength(1);
    });
  });
});
