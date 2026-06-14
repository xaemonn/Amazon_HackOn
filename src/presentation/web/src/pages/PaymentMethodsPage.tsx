import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { SkeletonLoader } from '../components/SkeletonLoader';
import './PaymentMethodsPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

type PaymentMethodType = 'upi' | 'card' | 'cod';

interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  isPreferred: boolean;
  createdAt: string;
  upiId?: string;
  lastFour?: string;
  expiryMonth?: number;
  expiryYear?: number;
  cardHolderName?: string;
}

type AddTab = 'upi' | 'card' | 'cod';

/**
 * PaymentMethodsPage — view, add, and remove saved payment methods.
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 15.1
 */
export function PaymentMethodsPage() {
  const { sessionToken } = useAuth();

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Add form state
  const [activeTab, setActiveTab] = useState<AddTab | null>(null);
  const [upiId, setUpiId] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cardHolderName, setCardHolderName] = useState('');

  const headers = useCallback((): HeadersInit => {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (sessionToken) {
      h['Authorization'] = `Bearer ${sessionToken}`;
    }
    return h;
  }, [sessionToken]);

  // Fetch payment methods
  const fetchMethods = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/account/payment-methods`, {
        headers: headers(),
      });
      if (!res.ok) {
        throw new Error('Failed to load payment methods');
      }
      const data = await res.json();
      setMethods(Array.isArray(data) ? data : data.paymentMethods ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    fetchMethods();
  }, [fetchMethods]);

  // Remove a payment method
  const handleRemove = async (methodId: string) => {
    setRemovingId(methodId);
    setFormError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/account/payment-methods/${methodId}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) {
        throw new Error('Failed to remove payment method');
      }
      setMethods((prev) => prev.filter((m) => m.id !== methodId));
      setSuccessMsg('Payment method removed');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setRemovingId(null);
    }
  };

  // Add payment method
  const handleAddUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    const trimmedUpiId = upiId.trim();
    if (!trimmedUpiId) {
      setFormError('UPI ID is required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/account/payment-methods`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ type: 'upi', upiId: trimmedUpiId }),
      });
      if (res.status === 409) {
        setFormError('This UPI ID is already saved');
        return;
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to add UPI');
      }
      setUpiId('');
      setActiveTab(null);
      setSuccessMsg('UPI added successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
      await fetchMethods();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add UPI');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    const trimmedLastFour = lastFour.trim();
    const trimmedName = cardHolderName.trim();
    const month = parseInt(expiryMonth, 10);
    const year = parseInt(expiryYear, 10);

    if (!trimmedLastFour || trimmedLastFour.length !== 4 || !/^\d{4}$/.test(trimmedLastFour)) {
      setFormError('Last four digits must be exactly 4 numbers');
      return;
    }
    if (isNaN(month) || month < 1 || month > 12) {
      setFormError('Expiry month must be between 1 and 12');
      return;
    }
    if (isNaN(year) || year < 2024 || year > 2099) {
      setFormError('Expiry year must be a valid 4-digit year');
      return;
    }
    if (!trimmedName || trimmedName.length < 2) {
      setFormError('Cardholder name is required (at least 2 characters)');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/account/payment-methods`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          type: 'card',
          lastFour: trimmedLastFour,
          expiryMonth: month,
          expiryYear: year,
          cardHolderName: trimmedName,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to add card');
      }
      setLastFour('');
      setExpiryMonth('');
      setExpiryYear('');
      setCardHolderName('');
      setActiveTab(null);
      setSuccessMsg('Card added successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
      await fetchMethods();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add card');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCod = async () => {
    setFormError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/account/payment-methods`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ type: 'cod' }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to add COD');
      }
      setActiveTab(null);
      setSuccessMsg('Cash on Delivery added');
      setTimeout(() => setSuccessMsg(null), 3000);
      await fetchMethods();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add COD');
    } finally {
      setSubmitting(false);
    }
  };

  // Render masked details for a method
  const renderMethodDetails = (method: PaymentMethod): string => {
    switch (method.type) {
      case 'upi':
        return method.upiId ?? 'UPI';
      case 'card':
        return `**** ${method.lastFour ?? '----'}  ${String(method.expiryMonth ?? '').padStart(2, '0')}/${method.expiryYear ?? '----'}  ${method.cardHolderName ?? ''}`;
      case 'cod':
        return 'Cash on Delivery';
      default:
        return 'Unknown';
    }
  };

  const renderTypeLabel = (type: PaymentMethodType): string => {
    switch (type) {
      case 'upi':
        return 'UPI';
      case 'card':
        return 'Card';
      case 'cod':
        return 'COD';
      default:
        return 'Other';
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="payment-methods-page">
        <h1 className="payment-methods-title">Payment Methods</h1>
        <div className="payment-methods-skeleton" aria-label="Loading payment methods">
          <SkeletonLoader height="72px" width="100%" borderRadius="8px" />
          <SkeletonLoader height="72px" width="100%" borderRadius="8px" />
          <SkeletonLoader height="72px" width="100%" borderRadius="8px" />
        </div>
      </div>
    );
  }

  return (
    <div className="payment-methods-page">
      <h1 className="payment-methods-title">Payment Methods</h1>

      {error && <p className="payment-methods-error" role="alert">{error}</p>}
      {successMsg && <p className="payment-methods-success" role="status">{successMsg}</p>}

      {/* List of saved methods */}
      {methods.length === 0 && !error ? (
        <p className="payment-methods-empty">No saved payment methods yet. Add one below.</p>
      ) : (
        <div className="payment-methods-list" role="list" aria-label="Saved payment methods">
          {methods.map((method) => (
            <div key={method.id} className="payment-method-card" role="listitem">
              <div className="payment-method-info">
                <span className="payment-method-type">{renderTypeLabel(method.type)}</span>
                <span className="payment-method-details">{renderMethodDetails(method)}</span>
                {method.isPreferred && (
                  <span className="payment-method-preferred">Preferred</span>
                )}
              </div>
              <button
                className="payment-method-remove-btn"
                onClick={() => handleRemove(method.id)}
                disabled={removingId === method.id}
                aria-label={`Remove ${renderTypeLabel(method.type)} payment method ${method.type === 'upi' ? method.upiId : method.type === 'card' ? `ending ${method.lastFour}` : 'COD'}`}
              >
                {removingId === method.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add payment method section */}
      <section className="payment-methods-add-section" aria-label="Add a payment method">
        <h2 className="payment-methods-add-title">Add Payment Method</h2>

        <div className="payment-methods-add-tabs" role="tablist" aria-label="Payment method type">
          <button
            role="tab"
            aria-selected={activeTab === 'upi'}
            className={`payment-methods-tab-btn ${activeTab === 'upi' ? 'payment-methods-tab-btn--active' : ''}`}
            onClick={() => { setActiveTab('upi'); setFormError(null); }}
            disabled={submitting}
          >
            Add UPI
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'card'}
            className={`payment-methods-tab-btn ${activeTab === 'card' ? 'payment-methods-tab-btn--active' : ''}`}
            onClick={() => { setActiveTab('card'); setFormError(null); }}
            disabled={submitting}
          >
            Add Card
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'cod'}
            className={`payment-methods-tab-btn ${activeTab === 'cod' ? 'payment-methods-tab-btn--active' : ''}`}
            onClick={() => { setActiveTab('cod'); setFormError(null); }}
            disabled={submitting}
          >
            Add COD
          </button>
        </div>

        {formError && <p className="payment-methods-error" role="alert">{formError}</p>}

        {/* UPI form */}
        {activeTab === 'upi' && (
          <form
            className="payment-methods-form"
            onSubmit={handleAddUpi}
            role="tabpanel"
            aria-label="Add UPI form"
          >
            <div className="payment-methods-form-row">
              <label className="payment-methods-label" htmlFor="upi-id-input">
                UPI ID
              </label>
              <input
                id="upi-id-input"
                className="payment-methods-input"
                type="text"
                placeholder="yourname@bank"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                disabled={submitting}
                autoComplete="off"
                aria-describedby="upi-hint"
              />
              <span id="upi-hint" className="payment-methods-label" style={{ fontWeight: 400, color: '#6b7280' }}>
                e.g. user@okaxis, name@ybl
              </span>
            </div>
            <button
              type="submit"
              className="payment-methods-submit-btn"
              disabled={submitting}
            >
              {submitting ? 'Adding…' : 'Add UPI'}
            </button>
          </form>
        )}

        {/* Card form */}
        {activeTab === 'card' && (
          <form
            className="payment-methods-form"
            onSubmit={handleAddCard}
            role="tabpanel"
            aria-label="Add card form"
          >
            <div className="payment-methods-form-row">
              <label className="payment-methods-label" htmlFor="card-last-four">
                Last 4 Digits
              </label>
              <input
                id="card-last-four"
                className="payment-methods-input payment-methods-input--small"
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="1234"
                value={lastFour}
                onChange={(e) => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
                disabled={submitting}
                autoComplete="off"
              />
            </div>
            <div className="payment-methods-form-row payment-methods-form-row--inline">
              <div className="payment-methods-form-row">
                <label className="payment-methods-label" htmlFor="card-expiry-month">
                  Expiry Month
                </label>
                <input
                  id="card-expiry-month"
                  className="payment-methods-input payment-methods-input--small"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="MM"
                  value={expiryMonth}
                  onChange={(e) => setExpiryMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  disabled={submitting}
                  autoComplete="off"
                />
              </div>
              <div className="payment-methods-form-row">
                <label className="payment-methods-label" htmlFor="card-expiry-year">
                  Expiry Year
                </label>
                <input
                  id="card-expiry-year"
                  className="payment-methods-input payment-methods-input--small"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="YYYY"
                  value={expiryYear}
                  onChange={(e) => setExpiryYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  disabled={submitting}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="payment-methods-form-row">
              <label className="payment-methods-label" htmlFor="card-holder-name">
                Cardholder Name
              </label>
              <input
                id="card-holder-name"
                className="payment-methods-input"
                type="text"
                placeholder="Name on card"
                value={cardHolderName}
                onChange={(e) => setCardHolderName(e.target.value)}
                disabled={submitting}
                autoComplete="cc-name"
              />
            </div>
            <button
              type="submit"
              className="payment-methods-submit-btn"
              disabled={submitting}
            >
              {submitting ? 'Adding…' : 'Add Card'}
            </button>
          </form>
        )}

        {/* COD — one-tap add */}
        {activeTab === 'cod' && (
          <div className="payment-methods-form" role="tabpanel" aria-label="Add COD">
            <p style={{ margin: 0, color: '#374151', fontSize: '0.95rem' }}>
              Cash on Delivery — pay when your order arrives.
            </p>
            <button
              type="button"
              className="payment-methods-submit-btn"
              onClick={handleAddCod}
              disabled={submitting}
            >
              {submitting ? 'Adding…' : 'Add Cash on Delivery'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
