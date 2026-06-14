// src/domain/catalog/Product.ts

/**
 * Fit metadata for a product, consumed by the FitGuard module
 * to generate size/fit recommendations.
 */
export interface FitMetadata {
  sizeOffsetIndicator: 'runs_small' | 'runs_large' | 'true_to_size';
  offsetMagnitude: number; // e.g., 1 = one size off
}

/**
 * Plain object representation of a Product entity.
 */
export interface ProductProps {
  id: string;
  title: string;
  brand: string;
  catalogImageUrl: string;
  category: string; // category ID reference
  basePrice: number; // in ₹
  fitMetadata?: FitMetadata;
  averageRating?: number;      // 1–5, one decimal place; absent means "No ratings yet"
  reviewCount?: number;        // total number of reviews; absent or 0 means no reviews
  additionalImages?: string[]; // extra gallery images beyond catalogImageUrl
}

/**
 * Immutable Product domain entity.
 * Represents a sellable item in the catalog.
 */
export class Product {
  private readonly _props: Readonly<ProductProps>;

  constructor(props: ProductProps) {
    this._props = Object.freeze({ ...props });
  }

  get id(): string { return this._props.id; }
  get title(): string { return this._props.title; }
  get brand(): string { return this._props.brand; }
  get catalogImageUrl(): string { return this._props.catalogImageUrl; }
  get category(): string { return this._props.category; }
  get basePrice(): number { return this._props.basePrice; }
  get fitMetadata(): FitMetadata | undefined { return this._props.fitMetadata; }
  get averageRating(): number | undefined { return this._props.averageRating; }
  get reviewCount(): number | undefined { return this._props.reviewCount; }
  get additionalImages(): string[] | undefined { return this._props.additionalImages ? [...this._props.additionalImages] : undefined; }

  toProps(): ProductProps { return { ...this._props }; }
}
