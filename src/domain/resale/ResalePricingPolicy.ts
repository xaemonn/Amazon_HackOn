/**
 * ResalePricingPolicy — pure, config-driven pricing & labelling for relisted
 * items. Keeps all grade→price/label/listing-type/window rules in one place so
 * pricing can be tuned without touching the aggregate or services.
 */

import type { ConditionGrade } from '../shared/types.js';
import type { ListingType } from './ResaleListing.js';

/** Tunable pricing parameters (sourced from AppConfig). */
export interface ResalePricingConfig {
  /** Discount % off original price per grade (0–100). */
  gradeDiscountPct: { A: number; B: number; C: number };
  /** Local-buyer window in days for grades that support direct transfer. */
  transferWindowDays: number;
  /** Gift-card amount as % of original price for the Grade C keep-offer. */
  keepOfferGiftCardPct: number;
}

export interface GradePricing {
  listingType: ListingType;
  conditionLabel: string;
  listedPrice: number;
  /** Whether this grade gets a local-buyer window (Grade A & C). */
  hasWindow: boolean;
}

const GRADE_META: Record<
  'A' | 'B' | 'C',
  { listingType: ListingType; label: string; hasWindow: boolean }
> = {
  A: { listingType: 'direct_transfer', label: 'Like New', hasWindow: true },
  B: { listingType: 'returned_discounted', label: 'Good (Returned)', hasWindow: false },
  C: { listingType: 'refurbished_discounted', label: 'Refurbished', hasWindow: true },
};

/** Grades that are eligible for relisting. D (and null) are not. */
export function isResaleGrade(
  grade: ConditionGrade | null,
): grade is 'A' | 'B' | 'C' {
  return grade === 'A' || grade === 'B' || grade === 'C';
}

export function priceForGrade(
  grade: 'A' | 'B' | 'C',
  originalPrice: number,
  config: ResalePricingConfig,
): GradePricing {
  const meta = GRADE_META[grade];
  const discountPct = config.gradeDiscountPct[grade];
  const listedPrice = roundPrice(originalPrice * (1 - discountPct / 100));
  return {
    listingType: meta.listingType,
    conditionLabel: meta.label,
    listedPrice,
    hasWindow: meta.hasWindow,
  };
}

export function keepOfferAmount(
  originalPrice: number,
  config: ResalePricingConfig,
): number {
  return roundPrice(originalPrice * (config.keepOfferGiftCardPct / 100));
}

/** Round to a whole currency unit (INR has no minor units in this demo). */
function roundPrice(value: number): number {
  return Math.round(value);
}
