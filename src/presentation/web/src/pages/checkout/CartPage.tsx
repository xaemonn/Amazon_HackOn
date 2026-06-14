import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import './CartPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface CartItem {
  variantId: string;
  productId: string;
  productName: string;
  productImage: string;
  unitPrice: number;
  condition: string;
  quantity: number;
  available?: boolean;
}

interface SaveForLaterItem {
  variantId: string;
  productId: string;
  productName: string;
  productImage: string;
  unitPrice: number;
  condition: string;
  savedAt: string;
}

interface CartView {
  items: CartItem[];
  saveForLater: SaveForLaterItem[];
  subtotal: number;
  itemCount: number;
  canCheckout: boolean;
}

/**
 * CartPage — displays active cart items with quantity controls,
 * save-for-later section, subtotal, and checkout button.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.6, 5.1, 5.2, 14.2, 14.3
 */
export function CartPage() {
  const { sessionToken } = useAuth();
  const navigate = useNavigate();

  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});

  const fetchCart = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/cart`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load cart');
      }

      const data: CartView = await res.json();
      setCart(data);

      // Initialize quantity inputs from fetched data
      const inputs: Record<string, string> = {};
      data.items.forEach((item) => {
        inputs[item.variantId] = String(item.quantity);
      });
      setQuantityInputs(inputs);
    } catch {
      setFetchError('Unable to load your cart. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const updateQuantity = useCallback(
    async (variantId: string, quantity: number) => {
      if (quantity < 0 || quantity > 99 || !Number.isInteger(quantity)) return;

      setActionLoading(variantId);
      try {
        const res = await fetch(`${API_BASE_URL}/api/cart/update-quantity`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ variantId, quantity }),
        });

        if (!res.ok) {
          throw new Error('Failed to update quantity');
        }

        const data: CartView = await res.json();
        setCart(data);

        const inputs: Record<string, string> = {};
        data.items.forEach((item) => {
          inputs[item.variantId] = String(item.quantity);
        });
        setQuantityInputs(inputs);
      } catch {
        // Silently fail — user can retry
      } finally {
        setActionLoading(null);
      }
    },
    [sessionToken]
  );

  const removeItem = useCallback(
    async (variantId: string) => {
      setActionLoading(variantId);
      try {
        const res = await fetch(`${API_BASE_URL}/api/cart/remove`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ variantId }),
        });

        if (!res.ok) {
          throw new Error('Failed to remove item');
        }

        const data: CartView = await res.json();
        setCart(data);

        const inputs: Record<string, string> = {};
        data.items.forEach((item) => {
          inputs[item.variantId] = String(item.quantity);
        });
        setQuantityInputs(inputs);
      } catch {
        // Silently fail — user can retry
      } finally {
        setActionLoading(null);
      }
    },
    [sessionToken]
  );

  const saveForLater = useCallback(
    async (variantId: string) => {
      setActionLoading(variantId);
      try {
        const res = await fetch(`${API_BASE_URL}/api/cart/save-for-later`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ variantId }),
        });

        if (!res.ok) {
          throw new Error('Failed to save item for later');
        }

        const data: CartView = await res.json();
        setCart(data);

        const inputs: Record<string, string> = {};
        data.items.forEach((item) => {
          inputs[item.variantId] = String(item.quantity);
        });
        setQuantityInputs(inputs);
      } catch {
        // Silently fail — user can retry
      } finally {
        setActionLoading(null);
      }
    },
    [sessionToken]
  );

  const moveToCart = useCallback(
    async (variantId: string) => {
      setActionLoading(variantId);
      try {
        const res = await fetch(`${API_BASE_URL}/api/cart/move-to-cart`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ variantId }),
        });

        if (!res.ok) {
          throw new Error('Failed to move item to cart');
        }

        const data: CartView = await res.json();
        setCart(data);

        const inputs: Record<string, string> = {};
        data.items.forEach((item) => {
          inputs[item.variantId] = String(item.quantity);
        });
        setQuantityInputs(inputs);
      } catch {
        // Silently fail — user can retry
      } finally {
        setActionLoading(null);
      }
    },
    [sessionToken]
  );

  const handleQuantityInputChange = (variantId: string, value: string) => {
    // Allow only digits in the input
    if (value !== '' && !/^\d+$/.test(value)) return;
    setQuantityInputs((prev) => ({ ...prev, [variantId]: value }));
  };

  const handleQuantityInputBlur = (variantId: string) => {
    const raw = quantityInputs[variantId] ?? '';
    const parsed = parseInt(raw, 10);

    if (isNaN(parsed) || parsed < 0 || parsed > 99) {
      // Revert to current cart quantity
      const item = cart?.items.find((i) => i.variantId === variantId);
      if (item) {
        setQuantityInputs((prev) => ({ ...prev, [variantId]: String(item.quantity) }));
      }
      return;
    }

    // Only update if changed
    const item = cart?.items.find((i) => i.variantId === variantId);
    if (item && parsed !== item.quantity) {
      updateQuantity(variantId, parsed);
    }
  };

  const handleQuantityInputKeyDown = (variantId: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleQuantityInputBlur(variantId);
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleDecrement = (variantId: string) => {
    const item = cart?.items.find((i) => i.variantId === variantId);
    if (!item || item.quantity <= 1) return;
    updateQuantity(variantId, item.quantity - 1);
  };

  const handleIncrement = (variantId: string) => {
    const item = cart?.items.find((i) => i.variantId === variantId);
    if (!item || item.quantity >= 10) return;
    updateQuantity(variantId, item.quantity + 1);
  };

  const formatPrice = (price: number): string => {
    return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatCondition = (condition: string): string => {
    const conditionMap: Record<string, string> = {
      New: 'New',
      Certified_Renewed: 'Certified Renewed',
      Open_Box: 'Open Box',
      Used_Like_New: 'Used – Like New',
    };
    return conditionMap[condition] ?? condition;
  };

  const availableItems = cart?.items.filter((item) => item.available !== false) ?? [];
  const unavailableItems = cart?.items.filter((item) => item.available === false) ?? [];

  // --- Render loading skeleton ---
  if (loading) {
    return (
      <div className="cart-page">
        <div className="cart-page__container">
          <h1 className="cart-page__title">Shopping Cart</h1>
          <div className="cart-page__skeleton" aria-label="Loading cart">
            {[1, 2, 3].map((i) => (
              <div key={i} className="cart-page__skeleton-item">
                <div className="cart-page__skeleton-image">
                  <SkeletonLoader height="80px" width="80px" borderRadius="6px" />
                </div>
                <div className="cart-page__skeleton-details">
                  <SkeletonLoader height="1rem" width="60%" />
                  <SkeletonLoader height="0.75rem" width="40%" />
                  <SkeletonLoader height="0.75rem" width="30%" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Render error state ---
  if (fetchError) {
    return (
      <div className="cart-page">
        <div className="cart-page__container">
          <h1 className="cart-page__title">Shopping Cart</h1>
          <div className="cart-page__error">
            <p className="cart-page__error-msg" role="alert">
              {fetchError}
            </p>
            <button
              className="cart-page__retry-btn"
              onClick={fetchCart}
              type="button"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render empty cart ---
  if (!cart || (cart.items.length === 0 && cart.saveForLater.length === 0)) {
    return (
      <div className="cart-page">
        <div className="cart-page__container">
          <h1 className="cart-page__title">Shopping Cart</h1>
          <div className="cart-page__empty">
            <div className="cart-page__empty-icon" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
              </svg>
            </div>
            <p className="cart-page__empty-msg">Your cart is empty</p>
            <p className="cart-page__empty-sub">
              Browse our catalog and add items to your cart.
            </p>
            <Link to="/" className="cart-page__empty-link">
              Browse Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- Render cart ---
  return (
    <div className="cart-page">
      <div className="cart-page__container">
        <h1 className="cart-page__title">Shopping Cart</h1>

        {/* Active cart items */}
        {availableItems.length > 0 && (
          <section className="cart-page__items" aria-label="Cart items">
            {availableItems.map((item) => (
              <div
                key={item.variantId}
                className="cart-page__item"
              >
                <div className="cart-page__item-image">
                  <img
                    src={item.productImage}
                    alt={item.productName}
                    className="cart-page__item-img"
                  />
                </div>
                <div className="cart-page__item-details">
                  <Link
                    to={`/product/${item.productId}`}
                    className="cart-page__item-name"
                  >
                    {item.productName}
                  </Link>
                  <span className="cart-page__item-condition">
                    {formatCondition(item.condition)}
                  </span>
                  <span className="cart-page__item-price">
                    {formatPrice(item.unitPrice)}
                  </span>

                  {/* Quantity controls */}
                  <div className="cart-page__quantity-controls">
                    <button
                      className="cart-page__qty-btn"
                      onClick={() => handleDecrement(item.variantId)}
                      disabled={item.quantity <= 1 || actionLoading === item.variantId}
                      aria-label={`Decrease quantity of ${item.productName}`}
                      type="button"
                    >
                      −
                    </button>
                    <input
                      className="cart-page__qty-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={quantityInputs[item.variantId] ?? String(item.quantity)}
                      onChange={(e) => handleQuantityInputChange(item.variantId, e.target.value)}
                      onBlur={() => handleQuantityInputBlur(item.variantId)}
                      onKeyDown={(e) => handleQuantityInputKeyDown(item.variantId, e)}
                      disabled={actionLoading === item.variantId}
                      aria-label={`Quantity of ${item.productName}`}
                    />
                    <button
                      className="cart-page__qty-btn"
                      onClick={() => handleIncrement(item.variantId)}
                      disabled={item.quantity >= 10 || actionLoading === item.variantId}
                      aria-label={`Increase quantity of ${item.productName}`}
                      type="button"
                    >
                      +
                    </button>
                  </div>

                  {/* Item actions */}
                  <div className="cart-page__item-actions">
                    <button
                      className="cart-page__action-btn cart-page__action-btn--remove"
                      onClick={() => removeItem(item.variantId)}
                      disabled={actionLoading === item.variantId}
                      aria-label={`Remove ${item.productName} from cart`}
                      type="button"
                    >
                      Remove
                    </button>
                    <button
                      className="cart-page__action-btn cart-page__action-btn--save"
                      onClick={() => saveForLater(item.variantId)}
                      disabled={actionLoading === item.variantId}
                      aria-label={`Save ${item.productName} for later`}
                      type="button"
                    >
                      Save for later
                    </button>
                  </div>
                </div>
                <div className="cart-page__item-subtotal">
                  {formatPrice(item.unitPrice * item.quantity)}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Unavailable items */}
        {unavailableItems.length > 0 && (
          <section className="cart-page__unavailable" aria-label="Unavailable items">
            <h2 className="cart-page__section-title">Unavailable Items</h2>
            <p className="cart-page__unavailable-note">
              These items are currently out of stock and are excluded from your subtotal.
            </p>
            {unavailableItems.map((item) => (
              <div
                key={item.variantId}
                className="cart-page__item cart-page__item--unavailable"
              >
                <div className="cart-page__item-image">
                  <img
                    src={item.productImage}
                    alt={item.productName}
                    className="cart-page__item-img cart-page__item-img--faded"
                  />
                  <span className="cart-page__unavailable-badge" aria-label="Out of stock">
                    Out of stock
                  </span>
                </div>
                <div className="cart-page__item-details">
                  <span className="cart-page__item-name cart-page__item-name--unavailable">
                    {item.productName}
                  </span>
                  <span className="cart-page__item-condition">
                    {formatCondition(item.condition)}
                  </span>
                  <div className="cart-page__item-actions">
                    <button
                      className="cart-page__action-btn cart-page__action-btn--remove"
                      onClick={() => removeItem(item.variantId)}
                      disabled={actionLoading === item.variantId}
                      aria-label={`Remove ${item.productName} from cart`}
                      type="button"
                    >
                      Remove
                    </button>
                    <button
                      className="cart-page__action-btn cart-page__action-btn--save"
                      onClick={() => saveForLater(item.variantId)}
                      disabled={actionLoading === item.variantId}
                      aria-label={`Save ${item.productName} for later`}
                      type="button"
                    >
                      Save for later
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Cart summary */}
        <div className="cart-page__summary">
          <div className="cart-page__summary-row">
            <span className="cart-page__summary-label">
              Subtotal ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'})
            </span>
            <span className="cart-page__summary-value">
              {formatPrice(cart.subtotal)}
            </span>
          </div>
          <button
            className="cart-page__checkout-btn"
            disabled={!cart.canCheckout}
            onClick={() => navigate('/checkout')}
            aria-label={cart.canCheckout ? 'Proceed to checkout' : 'Add items to enable checkout'}
            type="button"
          >
            Proceed to Checkout
          </button>
        </div>

        {/* Save for later section */}
        {cart.saveForLater.length > 0 && (
          <section className="cart-page__save-for-later" aria-label="Saved for later">
            <h2 className="cart-page__section-title">
              Saved for Later ({cart.saveForLater.length})
            </h2>
            <div className="cart-page__sfl-items">
              {cart.saveForLater.map((item) => (
                <div key={item.variantId} className="cart-page__sfl-item">
                  <div className="cart-page__sfl-image">
                    <img
                      src={item.productImage}
                      alt={item.productName}
                      className="cart-page__sfl-img"
                    />
                  </div>
                  <div className="cart-page__sfl-details">
                    <Link
                      to={`/product/${item.productId}`}
                      className="cart-page__sfl-name"
                    >
                      {item.productName}
                    </Link>
                    <span className="cart-page__sfl-condition">
                      {formatCondition(item.condition)}
                    </span>
                    <span className="cart-page__sfl-price">
                      {formatPrice(item.unitPrice)}
                    </span>
                    <button
                      className="cart-page__action-btn cart-page__action-btn--move"
                      onClick={() => moveToCart(item.variantId)}
                      disabled={actionLoading === item.variantId}
                      aria-label={`Move ${item.productName} back to cart`}
                      type="button"
                    >
                      Move to Cart
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
