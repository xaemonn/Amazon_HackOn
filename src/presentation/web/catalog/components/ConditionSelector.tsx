import { useCallback } from 'react';
import './ConditionSelector.css';

export interface VariantOption {
  id: string;
  condition: 'New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New';
  price: number;
  stock: number;
}

export interface ConditionSelectorProps {
  variants: VariantOption[];
  selectedVariantId: string;
  onSelect: (variantId: string) => void;
}

const CONDITION_LABELS: Record<string, string> = {
  New: 'New',
  Certified_Renewed: 'Certified Renewed',
  Open_Box: 'Open Box',
  Used_Like_New: 'Used – Like New',
};

export function ConditionSelector({
  variants,
  selectedVariantId,
  onSelect,
}: ConditionSelectorProps) {
  const sortedVariants = [...variants].sort((a, b) => a.price - b.price);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, variantId: string, index: number) => {
      let targetIndex: number | null = null;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        targetIndex = index < sortedVariants.length - 1 ? index + 1 : 0;
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        targetIndex = index > 0 ? index - 1 : sortedVariants.length - 1;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const variant = sortedVariants[index];
        if (variant.stock > 0) {
          onSelect(variantId);
        }
        return;
      }

      if (targetIndex !== null) {
        const targetVariant = sortedVariants[targetIndex];
        if (targetVariant.stock > 0) {
          onSelect(targetVariant.id);
        }
        // Move focus to the target element
        const container = (e.currentTarget as HTMLElement).parentElement;
        const buttons = container?.querySelectorAll('[role="radio"]');
        (buttons?.[targetIndex] as HTMLElement)?.focus();
      }
    },
    [sortedVariants, onSelect]
  );

  if (sortedVariants.length <= 1) {
    return null;
  }

  return (
    <div
      className="condition-selector"
      role="radiogroup"
      aria-label="Product condition options"
    >
      <span className="condition-selector__label">Condition:</span>
      <div className="condition-selector__options">
        {sortedVariants.map((variant, index) => {
          const isSelected = variant.id === selectedVariantId;
          const isOutOfStock = variant.stock === 0;
          const conditionLabel = CONDITION_LABELS[variant.condition] || variant.condition;

          return (
            <button
              key={variant.id}
              className={`condition-selector__option${
                isSelected ? ' condition-selector__option--selected' : ''
              }${isOutOfStock ? ' condition-selector__option--disabled' : ''}`}
              role="radio"
              aria-checked={isSelected}
              aria-disabled={isOutOfStock}
              aria-label={`${conditionLabel}, ₹${variant.price.toLocaleString('en-IN')}${
                isOutOfStock ? ', Out of Stock' : `, ${variant.stock} in stock`
              }`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => {
                if (!isOutOfStock) {
                  onSelect(variant.id);
                }
              }}
              onKeyDown={(e) => handleKeyDown(e, variant.id, index)}
              disabled={isOutOfStock}
              type="button"
            >
              <span className="condition-selector__condition-name">
                {conditionLabel}
              </span>
              <span className="condition-selector__price">
                ₹{variant.price.toLocaleString('en-IN')}
              </span>
              {isOutOfStock ? (
                <span className="condition-selector__stock condition-selector__stock--out">
                  Out of Stock
                </span>
              ) : (
                <span className="condition-selector__stock">
                  {variant.stock} in stock
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
