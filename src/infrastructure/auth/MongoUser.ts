import mongoose, { Schema, type Document } from 'mongoose';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  phone?: string | null;
  address?: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  } | null;
  sizeProfile?: {
    shoeSize?: number | null;
    apparelSize?: string | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema({
  street: { type: String },
  city:   { type: String },
  state:  { type: String },
  pincode:{ type: String },
}, { _id: false });

const sizeProfileSchema = new Schema({
  shoeSize:    { type: Number, default: null },
  apparelSize: { type: String, default: null },
}, { _id: false });

const userSchema = new Schema<IUser>(
  {
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phone:        { type: String, default: null },
    address:      { type: addressSchema, default: null },
    sizeProfile:  { type: sizeProfileSchema, default: null },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>('User', userSchema);
