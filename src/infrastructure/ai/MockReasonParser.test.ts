import { describe, it, expect } from 'vitest';
import { MockReasonParser } from './MockReasonParser.js';
import type { Defect } from '../../domain/shared/types.js';

describe('MockReasonParser', () => {
  const parser = new MockReasonParser();

  // ─── Keyword extraction tests ─────────────────────────────────────────────

  describe('claim extraction by keyword category', () => {
    const noDefects: Defect[] = [];

    it('extracts damage_description for "cracked"', async () => {
      const result = await parser.parseAndReconcile('The screen is cracked', noDefects);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('damage_description');
      expect(result.claims[0].itemArea).toBe('screen');
    });

    it('extracts damage_description for "broken"', async () => {
      const result = await parser.parseAndReconcile('Item arrived broken', noDefects);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('damage_description');
      expect(result.claims[0].itemArea).toBe('screen');
    });

    it('extracts missing_component for "missing"', async () => {
      const result = await parser.parseAndReconcile('Charger is missing from box', noDefects);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('missing_component');
      expect(result.claims[0].itemArea).toBe('accessory');
    });

    it('extracts missing_component for "not included"', async () => {
      const result = await parser.parseAndReconcile('Manual was not included', noDefects);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('missing_component');
      expect(result.claims[0].itemArea).toBe('accessory');
    });

    it('extracts cosmetic_issue for "scratched"', async () => {
      const result = await parser.parseAndReconcile('The back is scratched', noDefects);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('cosmetic_issue');
      expect(result.claims[0].itemArea).toBe('surface');
    });

    it('extracts cosmetic_issue for "faded"', async () => {
      const result = await parser.parseAndReconcile('Color is faded on one side', noDefects);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('cosmetic_issue');
      expect(result.claims[0].itemArea).toBe('surface');
    });

    it('extracts functional_defect for "not working"', async () => {
      const result = await parser.parseAndReconcile('The device is not working', noDefects);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('functional_defect');
      expect(result.claims[0].itemArea).toBe('device');
    });

    it('extracts functional_defect for "dead"', async () => {
      const result = await parser.parseAndReconcile('Battery is dead', noDefects);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('functional_defect');
      expect(result.claims[0].itemArea).toBe('device');
    });

    it('extracts damage_description for "dented"', async () => {
      const result = await parser.parseAndReconcile('The case is dented', noDefects);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('damage_description');
      expect(result.claims[0].itemArea).toBe('body');
    });

    it('extracts functional_defect for "loose"', async () => {
      const result = await parser.parseAndReconcile('Something is loose inside', noDefects);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('functional_defect');
      expect(result.claims[0].itemArea).toBe('internal');
    });

    it('extracts cosmetic_issue for "stained"', async () => {
      const result = await parser.parseAndReconcile('There is a stained spot on the cover', noDefects);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('cosmetic_issue');
      expect(result.claims[0].itemArea).toBe('exterior');
    });

    it('extracts damage_description for "chipped"', async () => {
      const result = await parser.parseAndReconcile('The corner is chipped', noDefects);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claimType).toBe('damage_description');
      expect(result.claims[0].itemArea).toBe('edge');
    });
  });

  // ─── Reconciliation tests ─────────────────────────────────────────────────

  describe('reconciliation with defects → aligns', () => {
    it('returns aligns when all claims match observed defects', async () => {
      const defects: Defect[] = [
        { location: 'screen', severity: 'severe', description: 'Cracked display' },
      ];
      const result = await parser.parseAndReconcile('The screen is cracked', defects);
      expect(result.status).toBe('aligns');
      expect(result.claims[0].verdict).toBe('supported');
    });
  });

  describe('reconciliation with no matching defects → contradicts', () => {
    it('returns contradicts when no claims match observed defects', async () => {
      const defects: Defect[] = [
        { location: 'bottom-left corner', severity: 'minor', description: 'Small scuff' },
      ];
      // "missing" maps to area "accessory" — no defect at "accessory" location
      const result = await parser.parseAndReconcile('Charger is missing', defects);
      expect(result.status).toBe('contradicts');
      expect(result.claims[0].verdict).toBe('unsupported');
    });
  });

  describe('mixed claims → partially_aligns', () => {
    it('returns partially_aligns when some claims match and some do not', async () => {
      const defects: Defect[] = [
        { location: 'screen', severity: 'severe', description: 'Cracked display' },
      ];
      // "cracked" → screen (matches), "missing" → accessory (no match)
      const result = await parser.parseAndReconcile(
        'The screen is cracked and the charger is missing',
        defects
      );
      expect(result.status).toBe('partially_aligns');
      const supported = result.claims.filter((c) => c.verdict === 'supported');
      const unsupported = result.claims.filter((c) => c.verdict === 'unsupported');
      expect(supported.length).toBeGreaterThan(0);
      expect(unsupported.length).toBeGreaterThan(0);
    });
  });

  // ─── Unparseable cases ─────────────────────────────────────────────────────

  describe('empty/whitespace-only text → unparseable', () => {
    it('returns unparseable for empty string', async () => {
      const result = await parser.parseAndReconcile('', []);
      expect(result.status).toBe('unparseable');
      expect(result.claims).toHaveLength(0);
    });

    it('returns unparseable for whitespace-only string', async () => {
      const result = await parser.parseAndReconcile('   \n\t  ', []);
      expect(result.status).toBe('unparseable');
      expect(result.claims).toHaveLength(0);
    });
  });

  describe('text with no recognizable keywords → unparseable', () => {
    it('returns unparseable when no keywords match', async () => {
      const defects: Defect[] = [
        { location: 'screen', severity: 'minor', description: 'Light scratch' },
      ];
      const result = await parser.parseAndReconcile('I just changed my mind about this', defects);
      expect(result.status).toBe('unparseable');
      expect(result.claims).toHaveLength(0);
    });
  });

  // ─── Multiple keywords ─────────────────────────────────────────────────────

  describe('multiple keywords extract multiple claims', () => {
    it('extracts separate claims for different keyword groups', async () => {
      const result = await parser.parseAndReconcile(
        'The screen is cracked and the surface is scratched and something is loose',
        []
      );
      expect(result.claims.length).toBe(3);
      const types = result.claims.map((c) => c.claimType);
      expect(types).toContain('damage_description');
      expect(types).toContain('cosmetic_issue');
      expect(types).toContain('functional_defect');
    });

    it('does not duplicate claims when multiple keywords from the same group match', async () => {
      // "cracked" and "broken" are in the same keyword group
      const result = await parser.parseAndReconcile('It is cracked and broken', []);
      const damageClaims = result.claims.filter((c) => c.claimType === 'damage_description' && c.itemArea === 'screen');
      expect(damageClaims).toHaveLength(1);
    });
  });

  // ─── Inconclusive when defects array is empty ──────────────────────────────

  describe('inconclusive verdicts when defects array is empty', () => {
    it('marks all claims as inconclusive when no defects observed', async () => {
      const result = await parser.parseAndReconcile('The screen is cracked', []);
      expect(result.claims[0].verdict).toBe('inconclusive');
      // partially_aligns because all are inconclusive (not supported, not unsupported)
      expect(result.status).toBe('partially_aligns');
    });
  });

  // ─── rawText preserved ─────────────────────────────────────────────────────

  describe('rawText preservation', () => {
    it('preserves the original free-text in rawText', async () => {
      const text = '  The screen is cracked  ';
      const result = await parser.parseAndReconcile(text, []);
      expect(result.rawText).toBe(text);
    });
  });

  // ─── parseReason delegates to parseAndReconcile ────────────────────────────

  describe('parseReason delegation', () => {
    it('produces the same result as parseAndReconcile (ignores productId)', async () => {
      const defects: Defect[] = [
        { location: 'screen', severity: 'severe', description: 'Cracked' },
      ];
      const text = 'The screen is cracked';
      const resultA = await parser.parseAndReconcile(text, defects);
      const resultB = await parser.parseReason(text, defects, 'some-product-id');
      expect(resultA).toEqual(resultB);
    });
  });
});
