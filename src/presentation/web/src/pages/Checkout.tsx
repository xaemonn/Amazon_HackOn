/**
 * Checkout — wrapper page for the checkout flow.
 * Delegates to the existing CheckoutLayout which manages multi-step checkout.
 *
 * Requirements: 6.12
 */

import { useState, useEffect } from 'react';
import { CheckoutLayout } from './checkout/CheckoutLayout';
import { AddressStep } from './checkout/AddressStep';
import { DeliveryStep } from './checkout/DeliveryStep';
import { PaymentStep } from './checkout/PaymentStep';
import { ReviewStep } from './checkout/ReviewStep';
import { ConfirmationStep } from './checkout/ConfirmationStep';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export function Checkout() {
  const [cartItemCount, setCartItemCount] = useState(1); // optimistic default

  useEffect(() => {
    // Fetch cart count to pass to CheckoutLayout
    fetch(`${API_BASE}/api/cart/demo-customer-1`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.items) {
          setCartItemCount(data.items.length);
        }
      })
      .catch(() => {
        // If cart fetch fails, keep optimistic default
      });
  }, []);

  return (
    <CheckoutLayout cartItemCount={cartItemCount}>
      <AddressStep />
      <DeliveryStep />
      <PaymentStep />
      <ReviewStep />
      <ConfirmationStep />
    </CheckoutLayout>
  );
}
