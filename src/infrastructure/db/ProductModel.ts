import mongoose, { Schema, type Document } from 'mongoose';

export interface IProduct extends Document {
  asin: string;
  title: string;
  category: string;
  price: number;
  originalPrice?: number;
  currency: string;
  rating: number;
  ratingsTotal: number;
  images: string[];
  description: string;
  featureBullets: string[];
  inStock: boolean;
  badge?: string;
  tags: string[];
  emoji: string;
  source: 'rainforest' | 'rapidapi' | 'curated';
}

const productSchema = new Schema<IProduct>(
  {
    asin:          { type: String, required: true, unique: true, index: true },
    title:         { type: String, required: true },
    category:      { type: String, required: true, index: true },
    price:         { type: Number, required: true },
    originalPrice: { type: Number },
    currency:      { type: String, default: 'INR' },
    rating:        { type: Number, default: 0 },
    ratingsTotal:  { type: Number, default: 0 },
    images:        [String],
    description:   { type: String, default: '' },
    featureBullets:[String],
    inStock:       { type: Boolean, default: true },
    badge:         { type: String },
    tags:          [String],
    emoji:         { type: String, default: '📦' },
    source:        { type: String, enum: ['rainforest', 'rapidapi', 'curated'], default: 'curated' },
  },
  { timestamps: true },
);

export const ProductModel = mongoose.model<IProduct>('Product', productSchema);
