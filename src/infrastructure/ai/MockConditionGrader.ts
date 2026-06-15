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
    confidence: 0.82,
    reasoning:
      'The item in the photos does not appear to match the ordered product. ' +
      'The shape, colour, and branding differ from the catalogue reference for this order — ' +
      'the photographed item looks like a different model or product entirely. ' +
      'We could not grade its condition because the identity could not be confirmed.',
    defects: [
      {
        location: 'overall',
        severity: 'severe',
        description: 'Photographed item does not match the ordered product (different model/colour/branding).',
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

// ─── Return-reason → grading signal map ─────────────────────────────────────
// Maps the structured return reason code to a verification note that the mock
// grader appends to its reasoning, simulating what a real AI would check.

const REASON_VERIFICATION: Record<string, string> = {
  size_issue:
    'Return reason: size issue. Photos show the item label/tag is visible — size markings appear consistent with the stated reason.',
  damaged_in_transit:
    'Return reason: damaged in transit. Images inspected for external impact damage. Visual findings align with the customer\'s stated reason.',
  wrong_item_sent:
    'Return reason: wrong item received. Product markings and branding compared against the ordered product reference — please see identity assessment above.',
  defective_item:
    'Return reason: item defective. Photos reviewed for functional defect indicators (broken components, malfunction signs).',
  changed_mind:
    'Return reason: change of mind. No damage expected; condition assessed purely on cosmetic inspection.',
  not_as_described:
    'Return reason: not as described. Item visually compared against catalog imagery for discrepancies in colour, material or features.',
  missing_parts:
    'Return reason: missing parts/accessories. Submitted photos checked for completeness of visible components.',
};

// ─── Implementation ───────────────────────────────────────────────────────────

export class MockConditionGrader implements IConditionGrader {
  /**
   * Assess the condition of a returned item using the seeded deterministic map.
   * Incorporates the customer's stated return reason as a verification signal.
   *
   * @param mediaReferences  - Used to heuristically detect potential AI-generated images.
   * @param productId        - Drives the seeded result lookup.
   * @param _catalogImageRef - Ignored in mock (real comparison requires Bedrock).
   * @param returnReason     - The customer's stated return reason; appended to reasoning.
   */
  async assessCondition(
    mediaReferences: MediaReference[],
    productId: string,
    _catalogImageRefs: string[],
    returnReason?: string,
  ): Promise<ConditionGradeResult> {
    const seed = SEEDED_RESULTS[productId] ?? DEFAULT_RESULT;

    // Build reasoning: base seed reasoning + reason verification note.
    let reasoning = seed.reasoning;
    if (returnReason) {
      const note = REASON_VERIFICATION[returnReason];
      if (note) {
        // Truncate so total stays ≤ 500 chars
        const suffix = ` | ${note}`;
        reasoning = (reasoning + suffix).slice(0, 500);
      }
    }

    // Heuristic AI-image detection for the mock:
    // In a real implementation Bedrock would analyse pixel-level artifacts.
    // Here we flag submissions with suspiciously few bytes as potentially
    // AI-generated (real camera photos are always larger than 5KB).
    const totalBytes = mediaReferences.reduce((s, m) => s + (m.sizeBytes ?? 0), 0);
    const avgBytes = mediaReferences.length > 0 ? totalBytes / mediaReferences.length : 0;
    const likelySynthetic = mediaReferences.length > 0 && avgBytes < 5_000;

    return {
      grade: seed.grade,
      confidence: seed.confidence,
      reasoning,
      defects: seed.defects.map((d) => ({ ...d })),
      authenticity: likelySynthetic
        ? {
            aiGenerated: true,
            confidence: 0.72,
            note: 'Images are unusually small (avg < 5 KB). Possible AI-generated or screen-captured photos — flagged for manual review.',
          }
        : {
            aiGenerated: false,
            confidence: 0.91,
            note: 'Images appear to be genuine camera captures. No synthetic-generation indicators detected.',
          },
    };
  }
}
