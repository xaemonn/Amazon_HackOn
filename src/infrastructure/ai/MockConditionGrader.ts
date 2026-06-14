/**
 * MockConditionGrader — deterministic, seeded condition grader for dev/demo.
 *
 * Returns predictable grades based on the productId passed in:
 *   item-grade-a → Grade A, confidence 0.95
 *   item-grade-b → Grade B, confidence 0.90
 *   item-grade-c → Grade C, confidence 0.85
 *   item-grade-d → Grade D, confidence 0.80
 *   (anything else) → Grade B, confidence 0.70 (default fallback)
 *
 * All outputs satisfy the invariant bounds:
 *   - reasoning ≤ 500 characters
 *   - defects.length ≤ 10
 *   - confidence ∈ [0.0, 1.0]
 *
 * Requirements: 5.4, 16.3, 16.6
 */

import type { IConditionGrader, ConditionGradeResult } from '../../domain/grading/IConditionGrader.js';
import type { MediaReference } from '../../domain/shared/types.js';
import type { Defect, ConditionGrade } from '../../domain/shared/types.js';

// ─── Seeded result map ────────────────────────────────────────────────────────

interface SeededResult {
  grade: ConditionGrade;
  confidence: number;
  reasoning: string;
  defects: Defect[];
}

const SEEDED_RESULTS: Record<string, SeededResult> = {
  'item-grade-a': {
    grade: 'A',
    confidence: 0.95,
    reasoning:
      'Item is in like-new condition. No visible defects or signs of use. ' +
      'All original components appear intact and the surface finish is pristine.',
    defects: [],
  },

  'item-grade-b': {
    grade: 'B',
    confidence: 0.90,
    reasoning:
      'Item shows light signs of use with minor cosmetic marks. ' +
      'Functionality is fully intact. Small scuff on the bottom-left corner ' +
      'does not affect performance or overall appearance significantly.',
    defects: [
      {
        location: 'bottom-left corner',
        severity: 'minor',
        description: 'Small scuff mark, approximately 2 mm, not visible during normal use.',
      },
    ],
  },

  'item-grade-c': {
    grade: 'C',
    confidence: 0.85,
    reasoning:
      'Item has noticeable cosmetic wear across multiple surfaces. ' +
      'Moderate scratches on the top panel and a small dent on the right edge. ' +
      'Core functionality is unaffected but the item requires cosmetic refurbishment.',
    defects: [
      {
        location: 'top panel',
        severity: 'moderate',
        description: 'Multiple light scratches covering roughly 10% of the top surface.',
      },
      {
        location: 'right edge',
        severity: 'moderate',
        description: 'Small dent, approximately 5 mm, likely from an impact.',
      },
    ],
  },

  'item-grade-d': {
    grade: 'D',
    confidence: 0.80,
    reasoning:
      'Item has significant damage and heavy signs of use. ' +
      'Cracked casing on the rear, deep scratches on the front panel, and a ' +
      'loose component inside. Functional testing is recommended before resale. ' +
      'Suitable for parts recovery or refurbishment only.',
    defects: [
      {
        location: 'rear casing',
        severity: 'severe',
        description: 'Cracked casing spanning the full width of the rear panel.',
      },
      {
        location: 'front panel',
        severity: 'moderate',
        description: 'Deep scratches across the display area, visible from normal viewing distance.',
      },
      {
        location: 'internal',
        severity: 'severe',
        description: 'Audible loose component when shaken; likely detached internal bracket.',
      },
    ],
  },

  'item-earbuds': {
    grade: 'B',
    confidence: 0.91,
    reasoning:
      'Wireless earbuds show light signs of use. ' +
      'Minor smudges on the charging case exterior. ' +
      'Both earbuds and charging case are functional; tips are intact.',
    defects: [
      {
        location: 'charging case exterior',
        severity: 'minor',
        description: 'Light smudges and fingerprints on the glossy surface.',
      },
    ],
  },
};

// ─── Default fallback (unknown productId) ────────────────────────────────────

const DEFAULT_RESULT: SeededResult = {
  grade: 'B',
  confidence: 0.70,
  reasoning:
    'No specific catalog entry found for this product. ' +
    'Default Grade B assessment applied based on general visual inspection. ' +
    'Minor cosmetic wear observed; full functionality assumed.',
  defects: [
    {
      location: 'surface (general)',
      severity: 'minor',
      description: 'Light surface wear consistent with normal use.',
    },
  ],
};

// ─── Implementation ───────────────────────────────────────────────────────────

export class MockConditionGrader implements IConditionGrader {
  /**
   * Assess the condition of a returned item using the seeded deterministic map.
   *
   * @param _mediaReferences  - Ignored in mock; real media not required for demo.
   * @param productId         - Drives the seeded result lookup.
   * @param _catalogImageRef  - Ignored in mock (real comparison requires Bedrock).
   */
  async assessCondition(
    _mediaReferences: MediaReference[],
    productId: string,
    _catalogImageRef: string
  ): Promise<ConditionGradeResult> {
    const seed = SEEDED_RESULTS[productId] ?? DEFAULT_RESULT;

    // Defensive copies so callers cannot mutate the seeded data.
    return {
      grade: seed.grade,
      confidence: seed.confidence,
      reasoning: seed.reasoning,
      defects: seed.defects.map((d) => ({ ...d })),
      authenticity: {
        aiGenerated: false,
        confidence: 0.9,
        note: 'Mock grader does not analyze image authenticity.',
      },
    };
  }
}
