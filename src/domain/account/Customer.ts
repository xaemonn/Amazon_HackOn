import type { Address } from './Address.js';
import type { PaymentMethod } from './PaymentMethod.js';
import type { NotificationPreferences } from './NotificationPreferences.js';

export interface Customer {
  id: string;
  name: string;              // 1–100 chars trimmed
  email: string;             // verified contact
  addresses: Address[];      // max 10; exactly 0 or 1 with isDefault=true
  paymentMethods: PaymentMethod[]; // max 10; exactly 0 or 1 with isPreferred=true
  notificationPreferences: NotificationPreferences;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Pure function that enforces the single-default invariant for an address list.
 *
 * Rules applied in order:
 * 1. If the list is empty, return empty — no default possible.
 * 2. If exactly one address has isDefault=true, the invariant is already satisfied.
 * 3. If no address has isDefault=true (e.g. after the default was removed), auto-promote
 *    the most recently added remaining address (highest createdAt) to default.
 * 4. If more than one address has isDefault=true (e.g. after setDefault was called),
 *    keep only the first one encountered as default and clear the rest.
 *
 * This single function is the authoritative enforcement point used by addAddress,
 * removeAddress, and setDefaultAddress so the invariant cannot be violated.
 */
export function enforceDefaultInvariant(addresses: Address[]): Address[] {
  if (addresses.length === 0) return addresses;

  const defaultCount = addresses.filter((a) => a.isDefault).length;

  if (defaultCount === 1) {
    // Invariant already satisfied — no changes needed
    return addresses;
  }

  if (defaultCount === 0) {
    // No default exists: auto-promote the most recently added address
    const sorted = [...addresses].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const newestId = sorted[0].id;
    return addresses.map((a) => ({
      ...a,
      isDefault: a.id === newestId,
    }));
  }

  // More than one default: keep only the first default found, clear the rest
  let foundDefault = false;
  return addresses.map((a) => {
    if (a.isDefault) {
      if (!foundDefault) {
        foundDefault = true;
        return a;
      }
      return { ...a, isDefault: false };
    }
    return a;
  });
}
