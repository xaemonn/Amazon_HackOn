/**
 * MockReasonParser — deterministic, keyword-based reason parser for dev/demo.
 *
 * Extracts structured claims from customer free-text using simple keyword matching,
 * then reconciles each claim against the observed defects from condition grading.
 *
 * Keyword → Claim mapping:
 *   "cracked", "broken", "shattered"          → damage_description, area: "screen"
 *   "missing", "not included", "absent"        → missing_component, area: "accessory"
 *   "scratched", "scuffed", "worn", "faded"    → cosmetic_issue, area: "surface"
 *   "not working", "doesn't turn on", "dead", "malfunction" → functional_defect, area: "device"
 *   "dent", "dented", "bent"                   → damage_description, area: "body"
 *   "loose", "rattling", "detached"            → functional_defect, area: "internal"
 *   "discolored", "stain", "stained"           → cosmetic_issue, area: "exterior"
 *   "chipped", "crumbling"                     → damage_description, area: "edge"
 *
 * Reconciliation logic:
 *   - For each claim, check if a matching defect exists (by location overlap).
 *   - If defects array is empty → all claims are "inconclusive".
 *   - If a defect with a similar location exists → "supported".
 *   - If no matching defect exists (but defects are present) → "unsupported".
 *
 * Overall status:
 *   - All supported → "aligns"
 *   - Mix of supported and unsupported/inconclusive → "partially_aligns"
 *   - No supported claims (all unsupported) → "contradicts"
 *   - No claims extracted → "unparseable"
 *
 * Requirements: 6.1, 6.2, 6.4, 6.5
 */

import type { IReasonParser as IReasonParserBarrel, ReasonReconciliation, ParsedClaim, ClaimType, ClaimVerdict } from '../../domain/grading/index.js';
import type { IReasonParser as IReasonParserDedicated } from '../../domain/grading/IReasonParser.js';
import type { Defect } from '../../domain/shared/types.js';

// ─── Keyword → Claim type mapping ────────────────────────────────────────────

interface KeywordMapping {
  keywords: string[];
  claimType: ClaimType;
  area: string;
  description: string;
}

const KEYWORD_MAPPINGS: KeywordMapping[] = [
  {
    keywords: ['cracked', 'broken', 'shattered'],
    claimType: 'damage_description',
    area: 'screen',
    description: 'Item has cracking or breakage damage',
  },
  {
    keywords: ['missing', 'not included', 'absent'],
    claimType: 'missing_component',
    area: 'accessory',
    description: 'A component or accessory is missing from the package',
  },
  {
    keywords: ['scratched', 'scuffed', 'worn', 'faded'],
    claimType: 'cosmetic_issue',
    area: 'surface',
    description: 'Surface has cosmetic wear or scratches',
  },
  {
    keywords: ['not working', "doesn't turn on", 'dead', 'malfunction'],
    claimType: 'functional_defect',
    area: 'device',
    description: 'Item is not functioning correctly',
  },
  {
    keywords: ['dent', 'dented', 'bent'],
    claimType: 'damage_description',
    area: 'body',
    description: 'Item body has dent or deformation damage',
  },
  {
    keywords: ['loose', 'rattling', 'detached'],
    claimType: 'functional_defect',
    area: 'internal',
    description: 'Internal component is loose or detached',
  },
  {
    keywords: ['discolored', 'stain', 'stained'],
    claimType: 'cosmetic_issue',
    area: 'exterior',
    description: 'Item has discoloration or staining',
  },
  {
    keywords: ['chipped', 'crumbling'],
    claimType: 'damage_description',
    area: 'edge',
    description: 'Item edge is chipped or crumbling',
  },
];

// ─── Implementation ───────────────────────────────────────────────────────────

export class MockReasonParser implements IReasonParserBarrel, IReasonParserDedicated {
  /**
   * Parse and reconcile — primary implementation (barrel export interface).
   *
   * Extracts claims from free-text via keyword matching and reconciles them
   * against observed defects from condition grading.
   */
  async parseAndReconcile(
    freeText: string,
    observedDefects: Defect[]
  ): Promise<ReasonReconciliation> {
    const trimmed = freeText.trim();

    // Requirement 6.5: if text is empty/whitespace-only, return unparseable
    if (trimmed.length === 0) {
      return {
        status: 'unparseable',
        claims: [],
        rawText: freeText,
      };
    }

    const lowerText = trimmed.toLowerCase();

    // Extract claims by scanning for keywords
    const claims = this.extractClaims(lowerText, observedDefects);

    // Requirement 6.5: if no claims could be extracted, return unparseable
    if (claims.length === 0) {
      return {
        status: 'unparseable',
        claims: [],
        rawText: freeText,
      };
    }

    // Determine overall reconciliation status (Requirement 6.4)
    const status = this.computeOverallStatus(claims);

    // Return defensive copies
    return {
      status,
      claims: claims.map((c) => ({ ...c })),
      rawText: freeText,
    };
  }

  /**
   * Parse reason — dedicated file interface. Delegates to parseAndReconcile,
   * ignoring the productId parameter (not needed for mock keyword matching).
   */
  async parseReason(
    freeText: string,
    defects: Defect[],
    _productId: string
  ): Promise<ReasonReconciliation> {
    return this.parseAndReconcile(freeText, defects);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Extract structured claims from lowercased text using keyword matching.
   * Each keyword group can produce at most one claim (avoids duplicates
   * when multiple keywords from the same group appear).
   */
  private extractClaims(lowerText: string, observedDefects: Defect[]): ParsedClaim[] {
    const claims: ParsedClaim[] = [];

    for (const mapping of KEYWORD_MAPPINGS) {
      const matched = mapping.keywords.some((kw) => lowerText.includes(kw));
      if (matched) {
        const verdict = this.determineVerdict(mapping, observedDefects);
        claims.push({
          claimType: mapping.claimType,
          itemArea: mapping.area,
          description: mapping.description,
          verdict,
        });
      }
    }

    return claims;
  }

  /**
   * Determine the verdict for a single claim by checking observed defects.
   *
   * - If defects array is empty → inconclusive (not enough evidence)
   * - If a defect with a matching/overlapping location exists → supported
   * - Otherwise → unsupported
   */
  private determineVerdict(mapping: KeywordMapping, observedDefects: Defect[]): ClaimVerdict {
    if (observedDefects.length === 0) {
      return 'inconclusive';
    }

    // Check if any observed defect location overlaps with the claim area
    const hasMatch = observedDefects.some((defect) => {
      const defectLocation = defect.location.toLowerCase();
      const claimArea = mapping.area.toLowerCase();

      // Match if the defect location contains the claim area or vice versa
      return defectLocation.includes(claimArea) || claimArea.includes(defectLocation);
    });

    return hasMatch ? 'supported' : 'unsupported';
  }

  /**
   * Compute overall reconciliation status from individual claim verdicts.
   *
   * Requirement 6.4:
   *   - All supported → aligns
   *   - At least one supported AND at least one unsupported/inconclusive → partially_aligns
   *   - No supported (all unsupported) → contradicts
   *   - Mix of only inconclusive (no supported, no unsupported) → partially_aligns
   */
  private computeOverallStatus(claims: ParsedClaim[]): 'aligns' | 'partially_aligns' | 'contradicts' {
    const hasSupported = claims.some((c) => c.verdict === 'supported');
    const hasUnsupported = claims.some((c) => c.verdict === 'unsupported');
    const hasInconclusive = claims.some((c) => c.verdict === 'inconclusive');

    if (hasSupported && !hasUnsupported && !hasInconclusive) {
      return 'aligns';
    }

    if (!hasSupported && hasUnsupported) {
      return 'contradicts';
    }

    // Mix of supported with unsupported/inconclusive, or all inconclusive
    return 'partially_aligns';
  }
}
