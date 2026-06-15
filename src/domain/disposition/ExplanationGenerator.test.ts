/**
 * Unit tests for ExplanationGenerator
 *
 * Validates:
 * - Each route produces ≤160 char explanation
 * - manual_inspection does NOT contain banned words
 * - manual_inspection DOES contain slaHours value
 * - Each explanation contains both a reason and a next step
 *
 * Requirements: 13.1, 13.2, 13.4, 13.5
 */

import { describe, it, expect } from 'vitest';
import { ExplanationGenerator, ExplanationContext } from './ExplanationGenerator.js';
import type { DispositionRoute } from '../shared/types.js';

describe('ExplanationGenerator', () => {
  const generator = new ExplanationGenerator();

  const allRoutes: DispositionRoute[] = [
    'instant_match',
    'list_for_resale',
    'refurbishment',
    'returnless_refund',
    'donate_or_recycle',
    'manual_inspection',
  ];

  function makeContext(overrides: Partial<ExplanationContext> = {}): ExplanationContext {
    return {
      route: 'instant_match',
      handlerName: 'TestHandler',
      slaHours: 24,
      hasNearbyBuyer: false,
      ...overrides,
    };
  }

  describe('length constraint (≤160 characters)', () => {
    it.each(allRoutes)('route "%s" produces explanation ≤160 chars', (route) => {
      const context = makeContext({ route, hasNearbyBuyer: route === 'instant_match' });
      const explanation = generator.generate(route, context);
      expect(explanation.length).toBeLessThanOrEqual(160);
    });

    it('manual_inspection with large slaHours still ≤160 chars', () => {
      const context = makeContext({ route: 'manual_inspection', slaHours: 168 });
      const explanation = generator.generate('manual_inspection', context);
      expect(explanation.length).toBeLessThanOrEqual(160);
    });
  });

  describe('manual_inspection banned words', () => {
    const bannedWords = ['fraud', 'suspicious', 'flagged', 'violation', 'denied', 'penalty'];

    it.each(bannedWords)('manual_inspection explanation does NOT contain "%s"', (word) => {
      const context = makeContext({ route: 'manual_inspection', slaHours: 24 });
      const explanation = generator.generate('manual_inspection', context);
      expect(explanation.toLowerCase()).not.toContain(word);
    });
  });

  describe('manual_inspection includes slaHours', () => {
    it('includes the slaHours value in the explanation', () => {
      const context = makeContext({ route: 'manual_inspection', slaHours: 24 });
      const explanation = generator.generate('manual_inspection', context);
      expect(explanation).toContain('24');
    });

    it('includes a different slaHours value when configured differently', () => {
      const context = makeContext({ route: 'manual_inspection', slaHours: 48 });
      const explanation = generator.generate('manual_inspection', context);
      expect(explanation).toContain('48');
    });
  });

  describe('each explanation contains reason and next step', () => {
    it('instant_match mentions item quality and refund action', () => {
      const context = makeContext({ route: 'instant_match', hasNearbyBuyer: true });
      const explanation = generator.generate('instant_match', context);
      // Reason: item is like-new / buyer nearby
      expect(explanation.toLowerCase()).toMatch(/like-new|buyer/);
      // Next step: refund
      expect(explanation.toLowerCase()).toMatch(/refund/);
    });

    it('list_for_resale mentions the marketplace listing and resale action', () => {
      const context = makeContext({ route: 'list_for_resale' });
      const explanation = generator.generate('list_for_resale', context);
      // Reason: item listed in the (returned) marketplace
      expect(explanation.toLowerCase()).toMatch(/marketplace|listed/);
      // Next step: refund when it sells / resale
      expect(explanation.toLowerCase()).toMatch(/resale|sells/);
    });

    it('refurbishment mentions wear and refurbishment action', () => {
      const context = makeContext({ route: 'refurbishment' });
      const explanation = generator.generate('refurbishment', context);
      // Reason: minor wear
      expect(explanation.toLowerCase()).toMatch(/minor wear|wear/);
      // Next step: refurbishment / refund
      expect(explanation.toLowerCase()).toMatch(/refurbish|refund/);
    });

    it('returnless_refund mentions keeping item and immediate refund', () => {
      const context = makeContext({ route: 'returnless_refund' });
      const explanation = generator.generate('returnless_refund', context);
      // Reason: keep the item
      expect(explanation.toLowerCase()).toMatch(/keep/);
      // Next step: refund immediately / no return needed
      expect(explanation.toLowerCase()).toMatch(/refund|no return/);
    });

    it('donate_or_recycle mentions donation/recycling', () => {
      const context = makeContext({ route: 'donate_or_recycle' });
      const explanation = generator.generate('donate_or_recycle', context);
      // Reason + next step: donated or recycled
      expect(explanation.toLowerCase()).toMatch(/donated|recycled/);
    });

    it('manual_inspection mentions review and timeframe', () => {
      const context = makeContext({ route: 'manual_inspection', slaHours: 24 });
      const explanation = generator.generate('manual_inspection', context);
      // Reason: team review
      expect(explanation.toLowerCase()).toMatch(/review|team/);
      // Next step: hear back / timeframe
      expect(explanation.toLowerCase()).toMatch(/hours|within/);
    });
  });

  describe('no internal identifiers or jargon', () => {
    it.each(allRoutes)('route "%s" does not contain internal identifiers', (route) => {
      const context = makeContext({ route, handlerName: 'GradeAInstantMatchHandler', hasNearbyBuyer: true });
      const explanation = generator.generate(route, context);

      // Must not contain handler names, route codes, or technical terms
      expect(explanation).not.toContain('Handler');
      expect(explanation).not.toContain('instant_match');
      expect(explanation).not.toContain('list_for_resale');
      expect(explanation).not.toContain('manual_inspection');
      expect(explanation).not.toContain('returnless_refund');
      expect(explanation).not.toContain('donate_or_recycle');
      expect(explanation).not.toContain('Grade A');
      expect(explanation).not.toContain('Grade B');
      expect(explanation).not.toContain('Grade C');
      expect(explanation).not.toContain('Grade D');
      expect(explanation).not.toMatch(/confidence.*score/i);
    });
  });
});
