import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCheckout } from './CheckoutLayout';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import './AddressStep.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface AddressData {
  id: string;
  recipientName: string;
  streetLine1: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
}

/**
 * AddressStep — First step of checkout. Displays saved addresses
 * ordered by default first then most recent. Pre-selects the default
 * address. Shows a prompt if no addresses exist.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
export function AddressStep() {
  const { sessionToken } = useAuth();
  const { state, setAddress, nextStep } = useCheckout();

  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(state.selectedAddressId);

  const fetchAddresses = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/checkout/addresses`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load addresses');
      }

      const data: AddressData[] = await res.json();

      // Sort: isDefault first, then most recently created (Req 6.1)
      const sorted = [...data].sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setAddresses(sorted);

      // Pre-select the first address (which is the default) if no selection yet (Req 6.2)
      if (sorted.length > 0 && !state.selectedAddressId) {
        const preSelected = sorted[0].id;
        setSelectedId(preSelected);
        setAddress(preSelected);
      }
    } catch {
      setFetchError('Unable to load your addresses. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, state.selectedAddressId, setAddress]);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const handleSelectAddress = (addressId: string) => {
    setSelectedId(addressId);
    setAddress(addressId);
  };

  const handleContinue = () => {
    if (selectedId) {
      nextStep();
    }
  };

  // --- Loading skeleton ---
  if (loading) {
    return (
      <div className="address-step">
        <h2 className="address-step__title">Select Delivery Address</h2>
        <div className="address-step__skeleton" aria-label="Loading addresses">
          {[1, 2, 3].map((i) => (
            <div key={i} className="address-step__skeleton-card">
              <SkeletonLoader height="1rem" width="50%" />
              <SkeletonLoader height="0.85rem" width="80%" />
              <SkeletonLoader height="0.85rem" width="60%" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- Error state with retry (Req 6.6) ---
  if (fetchError) {
    return (
      <div className="address-step">
        <h2 className="address-step__title">Select Delivery Address</h2>
        <div className="address-step__error">
          <p className="address-step__error-msg" role="alert">
            {fetchError}
          </p>
          <button
            className="address-step__retry-btn"
            onClick={fetchAddresses}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // --- No saved addresses (Req 6.4) ---
  if (addresses.length === 0) {
    return (
      <div className="address-step">
        <h2 className="address-step__title">Select Delivery Address</h2>
        <div className="address-step__empty">
          <div className="address-step__empty-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
          </div>
          <p className="address-step__empty-msg">No saved addresses</p>
          <p className="address-step__empty-sub">
            Add a delivery address to continue with checkout.
          </p>
          <Link to="/profile/addresses" className="address-step__add-link">
            Add Address
          </Link>
        </div>
      </div>
    );
  }

  // --- Address list ---
  return (
    <div className="address-step">
      <h2 className="address-step__title">Select Delivery Address</h2>

      <div className="address-step__list" role="radiogroup" aria-label="Saved addresses">
        {addresses.map((address) => (
          <button
            key={address.id}
            type="button"
            className={`address-step__card ${
              selectedId === address.id ? 'address-step__card--selected' : ''
            }`}
            onClick={() => handleSelectAddress(address.id)}
            aria-pressed={selectedId === address.id}
            aria-label={`${address.recipientName}, ${address.streetLine1}, ${address.city}, ${address.state} ${address.pincode}${address.isDefault ? ' (Default)' : ''}`}
          >
            <div className="address-step__card-radio">
              <span
                className={`address-step__radio-dot ${
                  selectedId === address.id ? 'address-step__radio-dot--active' : ''
                }`}
              />
            </div>
            <div className="address-step__card-details">
              <div className="address-step__card-header">
                <span className="address-step__card-name">{address.recipientName}</span>
                {address.isDefault && (
                  <span className="address-step__card-badge">Default</span>
                )}
              </div>
              <p className="address-step__card-line">{address.streetLine1}</p>
              <p className="address-step__card-line">
                {address.city}, {address.state} — {address.pincode}
              </p>
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="address-step__continue-btn"
        onClick={handleContinue}
        disabled={!selectedId}
        aria-disabled={!selectedId}
      >
        Continue
      </button>
    </div>
  );
}
