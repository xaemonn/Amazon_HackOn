import type { Product } from '../api/client';

/**
 * Size & fit advisor — reduces size-related returns by recommending the right
 * size up-front, based on per-brand fit bias and the shopper's saved size profile.
 *
 * The brand-rules table below is intentionally data-driven so it can later be
 * sourced from a backend service / ML model without touching the UI.
 */

export type FitBias = 'runs_small' | 'true_to_size' | 'runs_large';
export type SizeKind = 'shoe' | 'apparel';

export interface BrandFit {
  bias: FitBias;
  /** Customer-facing note explaining the brand's sizing behaviour. */
  note: string;
}

// ── Brand fit knowledge base ───────────────────────────────────────────────────
// Keys are matched case-insensitively against the product name + tags.
export const BRAND_FIT: Record<string, BrandFit> = {
  nike:            { bias: 'runs_small',   note: 'Nike footwear tends to run about half-to-one size small.' },
  'air max':       { bias: 'runs_small',   note: 'Nike Air Max styles run small — most customers size up.' },
  jordan:          { bias: 'runs_small',   note: 'Air Jordan silhouettes run narrow and small.' },
  adidas:          { bias: 'true_to_size', note: 'Adidas generally fits true to size.' },
  puma:            { bias: 'runs_small',   note: 'Puma shoes run slightly small.' },
  reebok:          { bias: 'true_to_size', note: 'Reebok fits true to size for most.' },
  'new balance':   { bias: 'runs_large',  note: 'New Balance runs roomy — many size down.' },
  vans:            { bias: 'runs_large',  note: 'Vans run about half a size large.' },
  converse:        { bias: 'runs_large',  note: 'Converse run large — size down by one.' },
  skechers:        { bias: 'true_to_size', note: 'Skechers fits true to size.' },
  // Apparel
  zara:            { bias: 'runs_small',   note: 'Zara clothing runs small — consider sizing up.' },
  'h&m':           { bias: 'runs_small',   note: 'H&M tends to run small.' },
  uniqlo:          { bias: 'true_to_size', note: 'Uniqlo fits true to size.' },
  levis:           { bias: 'true_to_size', note: "Levi's fits true to size." },
  "levi's":        { bias: 'true_to_size', note: "Levi's fits true to size." },
};

// ── Sizeable detection ──────────────────────────────────────────────────────────

const SHOE_HINTS = ['footwear', 'shoe', 'shoes', 'sneaker', 'running', 'trainer', 'boot'];
const APPAREL_HINTS = ['clothing', 'apparel', 'fashion', 'tshirt', 't-shirt', 'shirt', 'jeans', 'dress', 'jacket', 'hoodie'];

export const SHOE_SIZES = [5, 6, 7, 8, 9, 10, 11, 12];
export const APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function haystack(product: Product): string {
  return `${product.name} ${product.category} ${product.tags.join(' ')}`.toLowerCase();
}

export function getSizeKind(product: Product): SizeKind | null {
  const h = haystack(product);
  if (SHOE_HINTS.some((k) => h.includes(k))) return 'shoe';
  if (APPAREL_HINTS.some((k) => h.includes(k))) return 'apparel';
  return null;
}

export function detectBrand(product: Product): { key: string; fit: BrandFit } | null {
  const h = haystack(product);
  // Prefer the most specific (longest) matching key.
  const matches = Object.keys(BRAND_FIT)
    .filter((k) => h.includes(k))
    .sort((a, b) => b.length - a.length);
  if (matches.length === 0) return null;
  return { key: matches[0], fit: BRAND_FIT[matches[0]] };
}

// ── Size profile (saved per shopper) ────────────────────────────────────────────

export interface SizeProfile {
  shoeSize?: number;
  apparelSize?: string;
}

// ── Recommendation ───────────────────────────────────────────────────────────────

export interface SizeRecommendation {
  sizeable: boolean;
  kind: SizeKind | null;
  brandKey: string | null;
  bias: FitBias | null;
  brandNote: string | null;
  /** The shopper's usual size, if known. */
  baseSize: number | string | null;
  /** The size we suggest they select. */
  recommendedSize: number | string | null;
  /** Whether the recommendation differs from the usual size. */
  adjusted: boolean;
  /** Full customer-facing guidance message. */
  message: string;
  /** True when we lack a saved profile and can only give generic advice. */
  needsProfile: boolean;
  options: Array<number | string>;
}

function shoeLabel(n: number | string): string {
  return `UK ${n}`;
}

export function getSizeRecommendation(product: Product, profile: SizeProfile): SizeRecommendation {
  const kind = getSizeKind(product);
  if (!kind) {
    return {
      sizeable: false, kind: null, brandKey: null, bias: null, brandNote: null,
      baseSize: null, recommendedSize: null, adjusted: false, message: '',
      needsProfile: false, options: [],
    };
  }

  const brand = detectBrand(product);
  const bias = brand?.fit.bias ?? 'true_to_size';
  const brandNote = brand?.fit.note ?? null;
  const options = kind === 'shoe' ? SHOE_SIZES : APPAREL_SIZES;

  // ── Shoes (numeric) ──
  if (kind === 'shoe') {
    const base = profile.shoeSize ?? null;
    if (base == null) {
      return {
        sizeable: true, kind, brandKey: brand?.key ?? null, bias, brandNote,
        baseSize: null, recommendedSize: null, adjusted: false,
        needsProfile: true,
        message: brandNote
          ? `${brandNote} Add your usual shoe size to your profile for a personalised recommendation.`
          : 'Add your usual shoe size to your profile for a personalised fit recommendation.',
        options,
      };
    }

    let rec = base;
    if (bias === 'runs_small') rec = base + 1;
    else if (bias === 'runs_large') rec = base - 1;
    rec = Math.min(Math.max(rec, options[0] as number), options[options.length - 1] as number);
    const adjusted = rec !== base;

    let message: string;
    if (adjusted && bias === 'runs_small') {
      message = `${brandNote ?? 'This brand runs small.'} Your usual size is ${shoeLabel(base)}, so we recommend ${shoeLabel(rec)} to avoid a tight fit — and a return.`;
    } else if (adjusted && bias === 'runs_large') {
      message = `${brandNote ?? 'This brand runs large.'} Your usual size is ${shoeLabel(base)}, so we recommend ${shoeLabel(rec)} for the best fit.`;
    } else {
      message = `${brandNote ?? 'This brand fits true to size.'} Your usual size ${shoeLabel(base)} should fit well.`;
    }

    return {
      sizeable: true, kind, brandKey: brand?.key ?? null, bias, brandNote,
      baseSize: base, recommendedSize: rec, adjusted, needsProfile: false, message, options,
    };
  }

  // ── Apparel (lettered) ──
  const base = profile.apparelSize ?? null;
  if (base == null) {
    return {
      sizeable: true, kind, brandKey: brand?.key ?? null, bias, brandNote,
      baseSize: null, recommendedSize: null, adjusted: false,
      needsProfile: true,
      message: brandNote
        ? `${brandNote} Add your usual clothing size to your profile for a personalised recommendation.`
        : 'Add your usual clothing size to your profile for a personalised fit recommendation.',
      options,
    };
  }

  const idx = APPAREL_SIZES.indexOf(base);
  let recIdx = idx;
  if (idx >= 0) {
    if (bias === 'runs_small') recIdx = Math.min(idx + 1, APPAREL_SIZES.length - 1);
    else if (bias === 'runs_large') recIdx = Math.max(idx - 1, 0);
  }
  const rec = APPAREL_SIZES[recIdx] ?? base;
  const adjusted = rec !== base;

  let message: string;
  if (adjusted && bias === 'runs_small') {
    message = `${brandNote ?? 'This brand runs small.'} You usually wear ${base}, so we recommend ${rec} to avoid a snug fit — and a return.`;
  } else if (adjusted && bias === 'runs_large') {
    message = `${brandNote ?? 'This brand runs large.'} You usually wear ${base}, so we recommend ${rec} for the best fit.`;
  } else {
    message = `${brandNote ?? 'This brand fits true to size.'} Your usual size ${base} should fit well.`;
  }

  return {
    sizeable: true, kind, brandKey: brand?.key ?? null, bias, brandNote,
    baseSize: base, recommendedSize: rec, adjusted, needsProfile: false, message, options,
  };
}

export function formatSize(kind: SizeKind | null, size: number | string): string {
  return kind === 'shoe' ? `UK ${size}` : String(size);
}
