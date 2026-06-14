import type { MediaReference } from '../shared/types.js';

export type Condition = 'New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New';

export interface ProductVariantProps {
  id: string;
  productId: string;
  condition: Condition;
  price: number; // in ₹
  stock: number;
  sourceReturnId?: string;
  conditionReport?: string; // plain text from AI assessment
  unitPhotos?: MediaReference[]; // resolved to displayable URLs by presentation layer
}

export class ProductVariant {
  private readonly _props: Readonly<ProductVariantProps>;

  constructor(props: ProductVariantProps) {
    this._props = Object.freeze({ ...props });
  }

  get id(): string { return this._props.id; }
  get productId(): string { return this._props.productId; }
  get condition(): Condition { return this._props.condition; }
  get price(): number { return this._props.price; }
  get stock(): number { return this._props.stock; }
  get sourceReturnId(): string | undefined { return this._props.sourceReturnId; }
  get conditionReport(): string | undefined { return this._props.conditionReport; }
  get unitPhotos(): MediaReference[] | undefined {
    return this._props.unitPhotos ? [...this._props.unitPhotos] : undefined;
  }

  get isSecondLife(): boolean {
    return this.sourceReturnId !== undefined;
  }

  get isInStock(): boolean {
    return this.stock > 0;
  }

  toProps(): ProductVariantProps { return { ...this._props }; }
}
