import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { SkeletonLoader } from '../components/SkeletonLoader';
import './AddressBookPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/**
 * Address shape returned by the API.
 * Matches domain/account/Address.ts
 */
interface Address {
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

interface AddressFormData {
  recipientName: string;
  streetLine1: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

interface FieldErrors {
  recipientName?: string;
  streetLine1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

const EMPTY_FORM: AddressFormData = {
  recipientName: '',
  streetLine1: '',
  city: '',
  state: '',
  pincode: '',
  country: '',
};

/**
 * Validates address form fields per Req 4.6.
 * Returns per-field inline errors.
 */
function validateAddress(data: AddressFormData): FieldErrors {
  const errors: FieldErrors = {};

  if (!data.recipientName.trim()) {
    errors.recipientName = 'Recipient name is required';
  }
  if (!data.streetLine1.trim()) {
    errors.streetLine1 = 'Street address is required';
  }
  if (!data.city.trim()) {
    errors.city = 'City is required';
  }
  if (!data.state.trim()) {
    errors.state = 'State is required';
  }
  if (!data.pincode.trim()) {
    errors.pincode = 'Pincode is required';
  } else if (!/^\d{6}$/.test(data.pincode.trim())) {
    errors.pincode = 'Pincode must be exactly 6 digits';
  }
  if (!data.country.trim()) {
    errors.country = 'Country is required';
  }

  return errors;
}

/**
 * AddressBookPage — Displays the user's address book with controls to
 * add, edit, remove, and set default addresses.
 * 
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 15.1
 */
export function AddressBookPage() {
  const { sessionToken } = useAuth();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AddressFormData>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Remove confirmation
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const headers = useCallback(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionToken) {
      h['Authorization'] = `Bearer ${sessionToken}`;
    }
    return h;
  }, [sessionToken]);

  // Fetch addresses — sorted default-first (Req 4.7)
  const fetchAddresses = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/account/addresses`, {
        headers: headers(),
      });
      if (!res.ok) {
        throw new Error('Failed to load addresses');
      }
      const data: Address[] = await res.json();
      // Sort default-first
      const sorted = [...data].sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return 0;
      });
      setAddresses(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // --- Add Address ---
  const handleAdd = async () => {
    const errors = validateAddress(formData);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    // Optimistic: add a temporary address to the list
    const optimisticAddress: Address = {
      id: `temp-${Date.now()}`,
      ...formData,
      recipientName: formData.recipientName.trim(),
      streetLine1: formData.streetLine1.trim(),
      city: formData.city.trim(),
      state: formData.state.trim(),
      pincode: formData.pincode.trim(),
      country: formData.country.trim(),
      isDefault: addresses.length === 0,
      createdAt: new Date().toISOString(),
    };
    const previousAddresses = [...addresses];
    setAddresses(prev => [...prev, optimisticAddress]);
    setShowAddForm(false);
    setFormData(EMPTY_FORM);
    setFieldErrors({});

    try {
      const res = await fetch(`${API_BASE_URL}/api/account/addresses`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          recipientName: formData.recipientName.trim(),
          streetLine1: formData.streetLine1.trim(),
          city: formData.city.trim(),
          state: formData.state.trim(),
          pincode: formData.pincode.trim(),
          country: formData.country.trim(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to add address');
      }

      // Refetch to get the real state from server
      await fetchAddresses();
    } catch (err) {
      // Revert optimistic update
      setAddresses(previousAddresses);
      setError(err instanceof Error ? err.message : 'Failed to add address');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Edit Address ---
  const startEdit = (address: Address) => {
    setEditingId(address.id);
    setFormData({
      recipientName: address.recipientName,
      streetLine1: address.streetLine1,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: address.country,
    });
    setFieldErrors({});
    setShowAddForm(false);
  };

  const handleEdit = async () => {
    if (!editingId) return;

    const errors = validateAddress(formData);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    // Optimistic: update the address in place
    const previousAddresses = [...addresses];
    setAddresses(prev =>
      prev.map(a =>
        a.id === editingId
          ? {
              ...a,
              recipientName: formData.recipientName.trim(),
              streetLine1: formData.streetLine1.trim(),
              city: formData.city.trim(),
              state: formData.state.trim(),
              pincode: formData.pincode.trim(),
              country: formData.country.trim(),
            }
          : a
      )
    );
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFieldErrors({});

    try {
      const res = await fetch(`${API_BASE_URL}/api/account/addresses/${editingId}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          recipientName: formData.recipientName.trim(),
          streetLine1: formData.streetLine1.trim(),
          city: formData.city.trim(),
          state: formData.state.trim(),
          pincode: formData.pincode.trim(),
          country: formData.country.trim(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update address');
      }

      await fetchAddresses();
    } catch (err) {
      // Revert optimistic update
      setAddresses(previousAddresses);
      setError(err instanceof Error ? err.message : 'Failed to update address');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Remove Address ---
  const handleRemove = async (addressId: string) => {
    setConfirmRemoveId(null);
    const previousAddresses = [...addresses];

    // Optimistic: remove address from list
    setAddresses(prev => {
      const updated = prev.filter(a => a.id !== addressId);
      // If we removed the default and others remain, promote the newest (Req 4.4)
      if (
        previousAddresses.find(a => a.id === addressId)?.isDefault &&
        updated.length > 0
      ) {
        const sorted = [...updated].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return updated.map(a => ({
          ...a,
          isDefault: a.id === sorted[0].id,
        }));
      }
      return updated;
    });

    try {
      const res = await fetch(`${API_BASE_URL}/api/account/addresses/${addressId}`, {
        method: 'DELETE',
        headers: headers(),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to remove address');
      }

      await fetchAddresses();
    } catch (err) {
      // Revert
      setAddresses(previousAddresses);
      setError(err instanceof Error ? err.message : 'Failed to remove address');
    }
  };

  // --- Set as Default ---
  const handleSetDefault = async (addressId: string) => {
    const previousAddresses = [...addresses];

    // Optimistic: mark this address as default, unmark others (Req 4.2)
    setAddresses(prev => {
      const updated = prev.map(a => ({
        ...a,
        isDefault: a.id === addressId,
      }));
      // Re-sort: default first
      return updated.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return 0;
      });
    });

    try {
      const res = await fetch(`${API_BASE_URL}/api/account/addresses/${addressId}/default`, {
        method: 'PUT',
        headers: headers(),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to set default address');
      }

      await fetchAddresses();
    } catch (err) {
      // Revert
      setAddresses(previousAddresses);
      setError(err instanceof Error ? err.message : 'Failed to set default address');
    }
  };

  // --- Form field change handler ---
  const handleFieldChange = (field: keyof AddressFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for the field being edited
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // --- Render helpers ---
  const renderForm = (mode: 'add' | 'edit') => {
    const title = mode === 'add' ? 'Add a new address' : 'Edit address';
    const onSubmit = mode === 'add' ? handleAdd : handleEdit;

    const fields: { key: keyof AddressFormData; label: string; placeholder: string }[] = [
      { key: 'recipientName', label: 'Full name (recipient)', placeholder: 'e.g. Priya Sharma' },
      { key: 'streetLine1', label: 'Street address', placeholder: 'e.g. 42 MG Road, Apt 3' },
      { key: 'city', label: 'City', placeholder: 'e.g. Bengaluru' },
      { key: 'state', label: 'State', placeholder: 'e.g. Karnataka' },
      { key: 'pincode', label: 'Pincode', placeholder: '6-digit pincode' },
      { key: 'country', label: 'Country', placeholder: 'e.g. India' },
    ];

    return (
      <div className="address-form" role="form" aria-label={title}>
        <h2 className="address-form__title">{title}</h2>
        {fields.map(({ key, label, placeholder }) => (
          <div className="address-form__field" key={key}>
            <label className="address-form__label" htmlFor={`addr-${key}`}>
              {label} <span aria-hidden="true">*</span>
            </label>
            <input
              id={`addr-${key}`}
              type="text"
              className={`address-form__input ${fieldErrors[key] ? 'address-form__input--error' : ''}`}
              value={formData[key]}
              onChange={e => handleFieldChange(key, e.target.value)}
              placeholder={placeholder}
              aria-invalid={!!fieldErrors[key]}
              aria-describedby={fieldErrors[key] ? `addr-${key}-error` : undefined}
              autoComplete={key === 'pincode' ? 'postal-code' : undefined}
            />
            {fieldErrors[key] && (
              <div id={`addr-${key}-error`} className="address-form__error" role="alert">
                {fieldErrors[key]}
              </div>
            )}
          </div>
        ))}
        <div className="address-form__actions">
          <button
            type="button"
            className="address-form__submit"
            onClick={onSubmit}
            disabled={submitting}
            aria-label={mode === 'add' ? 'Save new address' : 'Save changes'}
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            className="address-form__cancel"
            onClick={() => {
              setShowAddForm(false);
              setEditingId(null);
              setFormData(EMPTY_FORM);
              setFieldErrors({});
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const renderAddressCard = (address: Address) => {
    // If this address is being edited, show the form instead
    if (editingId === address.id) {
      return (
        <div key={address.id}>
          {renderForm('edit')}
        </div>
      );
    }

    return (
      <div
        key={address.id}
        className={`address-card ${address.isDefault ? 'address-card--default' : ''}`}
        aria-label={`Address for ${address.recipientName}${address.isDefault ? ' (default)' : ''}`}
      >
        {address.isDefault && (
          <span className="address-card__badge">Default</span>
        )}
        <div className="address-card__name">{address.recipientName}</div>
        <div className="address-card__detail">
          {address.streetLine1}
          <br />
          {address.city}, {address.state} — {address.pincode}
          <br />
          {address.country}
        </div>
        <div className="address-card__actions">
          <button
            type="button"
            className="address-card__btn"
            onClick={() => startEdit(address)}
            aria-label={`Edit address for ${address.recipientName}`}
          >
            Edit
          </button>
          <button
            type="button"
            className="address-card__btn address-card__btn--danger"
            onClick={() => setConfirmRemoveId(address.id)}
            aria-label={`Remove address for ${address.recipientName}`}
          >
            Remove
          </button>
          {!address.isDefault && (
            <button
              type="button"
              className="address-card__btn address-card__btn--default"
              onClick={() => handleSetDefault(address.id)}
              aria-label={`Set address for ${address.recipientName} as default`}
            >
              Set as default
            </button>
          )}
        </div>

        {/* Confirmation prompt for removal (Req 4.3, 4.5) */}
        {confirmRemoveId === address.id && (
          <div className="address-card__confirm" role="alertdialog" aria-label="Confirm removal">
            <p>Remove this address? This cannot be undone.</p>
            <div className="address-card__confirm-actions">
              <button
                type="button"
                className="address-card__btn address-card__btn--danger"
                onClick={() => handleRemove(address.id)}
                aria-label="Confirm remove"
              >
                Yes, remove
              </button>
              <button
                type="button"
                className="address-card__btn"
                onClick={() => setConfirmRemoveId(null)}
                aria-label="Cancel removal"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="address-book-page">
        <h1>Address Book</h1>
        <div className="address-book-page__skeleton">
          <SkeletonLoader height="120px" />
          <SkeletonLoader height="120px" />
        </div>
      </div>
    );
  }

  return (
    <div className="address-book-page">
      <h1>Address Book</h1>

      {/* Error toast */}
      {error && (
        <div className="address-book-page__error" role="alert">
          {error}
        </div>
      )}

      {/* Add button */}
      {!showAddForm && !editingId && (
        <button
          type="button"
          className="address-book-page__add-btn"
          onClick={() => {
            setShowAddForm(true);
            setFormData(EMPTY_FORM);
            setFieldErrors({});
          }}
          aria-label="Add a new address"
        >
          + Add a new address
        </button>
      )}

      {/* Add form */}
      {showAddForm && renderForm('add')}

      {/* Address list — default first (Req 4.7) */}
      {addresses.length === 0 && !showAddForm ? (
        <div className="address-book-page__empty">
          <p>You don't have any saved addresses yet.</p>
          <p>Add one to speed up checkout.</p>
        </div>
      ) : (
        addresses.map(renderAddressCard)
      )}
    </div>
  );
}
