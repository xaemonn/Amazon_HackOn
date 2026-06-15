import mongoose, { Schema, type Document } from 'mongoose';

export interface IReview extends Document {
  _id: mongoose.Types.ObjectId;
  productId: string;
  customerId: string;
  customerName: string;
  rating: number;
  title: string;
  body: string;
  returnRequestId?: string | null;
  photoUrls: string[];
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    productId:       { type: String, required: true, index: true },
    customerId:      { type: String, required: true },
    customerName:    { type: String, required: true },
    rating:          { type: Number, required: true, min: 1, max: 5 },
    title:           { type: String, required: true, trim: true, maxlength: 120 },
    body:            { type: String, required: true, trim: true, maxlength: 2000 },
    returnRequestId: { type: String, default: null },
    photoUrls:       { type: [String], default: [] },
  },
  { timestamps: true },
);

export const Review = mongoose.model<IReview>('Review', reviewSchema);
