// src/application/catalog/CatalogConfig.ts

export interface CatalogConfig {
  /** Discount percentage for Open_Box variants created from returns (default: 15) */
  openBoxDiscountPercent: number;
  /** Discount percentage for Certified_Renewed variants (default: 25) */
  certifiedRenewedDiscountPercent: number;
  /** Maximum number of unit photos stored per variant (default: 10) */
  maxUnitPhotos: number;
  /** Returnless refund threshold in ₹ (default: 500) */
  returnlessRefundThreshold: number;
  /** Maximum autocomplete suggestions (default: 8) */
  maxAutocompleteSuggestions: number;
  /** Search results per page (default: 20) */
  searchPageSize: number;
  /** Maximum deals rail items (default: 10) */
  maxDealsRailItems: number;
  /** Maximum second life rail items (default: 10) */
  maxSecondLifeRailItems: number;
  /** Maximum category tiles on home page (default: 12) */
  maxCategoryTiles: number;
  /** Minimum delivery days from today (default: 2) */
  deliveryMinDays: number;
  /** Maximum delivery days from today (default: 4) */
  deliveryMaxDays: number;
}

export const DEFAULT_CATALOG_CONFIG: CatalogConfig = {
  openBoxDiscountPercent: 15,
  certifiedRenewedDiscountPercent: 25,
  maxUnitPhotos: 10,
  returnlessRefundThreshold: 500,
  maxAutocompleteSuggestions: 8,
  searchPageSize: 20,
  maxDealsRailItems: 10,
  maxSecondLifeRailItems: 10,
  maxCategoryTiles: 12,
  deliveryMinDays: 2,
  deliveryMaxDays: 4,
};
