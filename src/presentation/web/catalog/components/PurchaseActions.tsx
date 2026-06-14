import './PurchaseActions.css';

export interface PurchaseActionsProps {
  variantId: string;
  disabled: boolean;
  onAddToCart?: (variantId: string) => void;
  onBuyNow?: (variantId: string) => void;
}

export function PurchaseActions({
  variantId,
  disabled,
  onAddToCart,
  onBuyNow,
}: PurchaseActionsProps) {
  return (
    <div className="purchase-actions" aria-label="Purchase options">
      {disabled && (
        <p className="purchase-actions__unavailable" role="status" aria-live="polite">
          Currently Unavailable
        </p>
      )}
      <div className="purchase-actions__buttons">
        <button
          className="purchase-actions__btn purchase-actions__btn--cart"
          type="button"
          disabled={disabled}
          onClick={() => onAddToCart?.(variantId)}
          aria-label="Add to Cart"
        >
          Add to Cart
        </button>
        <button
          className="purchase-actions__btn purchase-actions__btn--buy"
          type="button"
          disabled={disabled}
          onClick={() => onBuyNow?.(variantId)}
          aria-label="Buy Now"
        >
          Buy Now
        </button>
      </div>
    </div>
  );
}
