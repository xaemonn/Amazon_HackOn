// src/domain/catalog/Category.ts

/**
 * Plain object representation of a Category entity.
 */
export interface CategoryProps {
  id: string;
  name: string;
  imageUrl: string;
}

/**
 * Immutable Category domain entity.
 * Represents a product department or classification used for navigation and filtering.
 */
export class Category {
  private readonly _props: Readonly<CategoryProps>;

  constructor(props: CategoryProps) {
    this._props = Object.freeze({ ...props });
  }

  get id(): string { return this._props.id; }
  get name(): string { return this._props.name; }
  get imageUrl(): string { return this._props.imageUrl; }

  toProps(): CategoryProps { return { ...this._props }; }
}
