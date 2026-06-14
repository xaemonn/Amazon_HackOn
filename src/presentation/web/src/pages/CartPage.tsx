import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiCheckout } from '../api/client';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import './CartPage.css';

export function CartPage() {
  const { items, itemCount, total, removeItem, setQuantity, clearCart } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [paymentType, setPaymentType] = useState<'prepaid' | 'cod'>('prepaid');
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/cart' } });
      return;
    }
    setError(null);
    setIsPlacing(true);
    try {
      const order = await apiCheckout(
        items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
        paymentType,
      );
      clearCart();
      navigate('/orders', { state: { newOrderId: order.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed. Please try again.');
    } finally {
      setIsPlacing(false);
    }
  };

  if (itemCount === 0) {
    return (
      <div className="cart-empty">
        <div className="cart-empty__icon" aria-hidden="true">🛒</div>
        <h1>Your cart is empty</h1>
        <p>Add items from the catalog to get started.</p>
        <Link to="/catalog" className="btn btn-primary">Browse products</Link>
      </div>
    );
  }

  const tax = Math.round(total * 0.18);
  const grandTotal = total + tax;

  return (
    <div className="cart-page">
      <h1 className="cart-title">Shopping Cart <span className="cart-title__count">({itemCount} item{itemCount !== 1 ? 's' : ''})</span></h1>

      <div className="cart-layout">
        {/* Item list */}
        <section className="cart-items" aria-label="Cart items">
          {items.map(({ product, quantity }) => (
            <article key={product.id} className="cart-item">
              <div className="cart-item__image" aria-hidden="true">{product.emoji}</div>

              <div className="cart-item__info">
                <Link to={`/catalog/${product.id}`} className="cart-item__name">
                  {product.name}
                </Link>
                <p className="cart-item__category">{product.category}</p>
                <p className="cart-item__unit-price">₹{product.price.toLocaleString('en-IN')} each</p>
              </div>

              <div className="cart-item__controls">
                <div className="qty-control" role="group" aria-label={`Quantity for ${product.name}`}>
                  <button
                    type="button"
                    className="qty-btn"
                    onClick={() => setQuantity(product.id, quantity - 1)}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="qty-value">{quantity}</span>
                  <button
                    type="button"
                    className="qty-btn"
                    onClick={() => setQuantity(product.id, quantity + 1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <p className="cart-item__subtotal">
                  ₹{(product.price * quantity).toLocaleString('en-IN')}
                </p>

                <button
                  type="button"
                  className="cart-item__remove"
                  onClick={() => removeItem(product.id)}
                  aria-label={`Remove ${product.name}`}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </section>

        {/* Order summary */}
        <aside className="cart-summary" aria-label="Order summary">
          <h2 className="cart-summary__title">Order Summary</h2>

          <dl className="cart-summary__lines">
            <div className="cart-summary__line">
              <dt>Subtotal ({itemCount} item{itemCount !== 1 ? 's' : ''})</dt>
              <dd>₹{total.toLocaleString('en-IN')}</dd>
            </div>
            <div className="cart-summary__line">
              <dt>GST (18%)</dt>
              <dd>₹{tax.toLocaleString('en-IN')}</dd>
            </div>
            <div className="cart-summary__line">
              <dt>Delivery</dt>
              <dd className="cart-summary__free">Free</dd>
            </div>
            <div className="cart-summary__line cart-summary__line--total">
              <dt>Total</dt>
              <dd>₹{grandTotal.toLocaleString('en-IN')}</dd>
            </div>
          </dl>

          {/* Payment type */}
          <fieldset className="payment-fieldset">
            <legend className="payment-legend">Payment method</legend>
            <label className={`payment-option ${paymentType === 'prepaid' ? 'payment-option--selected' : ''}`}>
              <input
                type="radio"
                name="payment"
                value="prepaid"
                checked={paymentType === 'prepaid'}
                onChange={() => setPaymentType('prepaid')}
              />
              <span>💳 Prepaid (UPI / Card)</span>
            </label>
            <label className={`payment-option ${paymentType === 'cod' ? 'payment-option--selected' : ''}`}>
              <input
                type="radio"
                name="payment"
                value="cod"
                checked={paymentType === 'cod'}
                onChange={() => setPaymentType('cod')}
              />
              <span>💵 Cash on Delivery</span>
            </label>
          </fieldset>

          {error && <p className="cart-error" role="alert">{error}</p>}

          <button
            type="button"
            className="cart-summary__btn"
            onClick={handleCheckout}
            disabled={isPlacing}
          >
            {isPlacing ? 'Placing order…' : isAuthenticated ? 'Place Order' : 'Sign in to Checkout'}
          </button>

          <Link to="/catalog" className="cart-summary__continue">
            ← Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
