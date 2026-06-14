import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ImageGallery, GalleryImage } from '../components/ImageGallery';
import { ConditionSelector } from '../components/ConditionSelector';
import { SecondLifeDetails } from '../components/SecondLifeDetails';
import { PurchaseActions } from '../components/PurchaseActions';
import './ProductDetailPage.css';

export interface ProductDetailData {
  id: string;
  title: string;
  brand: string;
  catalogImageUrl: string;
  category: string;
  basePrice: number;
  fitMetadata?: { sizeOffsetIndicator: string; offsetMagnitude: number };
}

export interface VariantData {
  id: string;
  productId: string;
  condition: 'New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New';
  price: number;
  stock: number;
  sourceReturnId?: string;
  conditionReport?: string;
  unitPhotos?: { id: string; storageKey: string }[];
}

export interface DeliveryEstimate {
  earliestDate: string;
  latestDate: string;
  displayText: string;
}

export interface ProductDetailPageProps {
  product: ProductDetailData | null;
  variants: VariantData[];
  deliveryEstimate: DeliveryEstimate | null;
  loading?: boolean;
  error?: 'not_found' | 'network_error' | null;
  averageRating?: number | null;
  reviewCount?: number;
  onAddToCart?: (variantId: string) => void;
  onBuyNow?: (variantId: string) => void;
  onRetry?: () => void;
}

/**
 * Selects the default variant: lowest-priced in-stock, or lowest-priced overall if none in stock.
 */
function selectDefaultVariant(variants: VariantData[]): VariantData | null {
  if (variants.length === 0) return null;

  const inStock = variants.filter((v) => v.stock > 0);
  const pool = inStock.length > 0 ? inStock : variants;

  return pool.reduce((lowest, v) => (v.price < lowest.price ? v : lowest), pool[0]);
}

export function ProductDetailPage({
  product,
  variants,
  deliveryEstimate,
  loading = false,
  error = null,
  averageRating = null,
  reviewCount = 0,
  onAddToCart,
  onBuyNow,
  onRetry,
}: ProductDetailPageProps) {
  const defaultVariant = useMemo(() => selectDefaultVariant(variants), [variants]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');

  // Set default selection on load or when variants change
  useEffect(() => {
    if (defaultVariant) {
      setSelectedVariantId(defaultVariant.id);
    }
  }, [defaultVariant]);

  // Auto-switch: if selected variant goes out of stock, switch to next cheapest in-stock
  useEffect(() => {
    if (!selectedVariantId || variants.length === 0) return;

    const selected = variants.find((v) => v.id === selectedVariantId);
    if (selected && selected.stock === 0) {
      const inStock = variants
        .filter((v) => v.stock > 0)
        .sort((a, b) => a.price - b.price);

      if (inStock.length > 0) {
        setSelectedVariantId(inStock[0].id);
      }
    }
  }, [variants, selectedVariantId]);

  const handleVariantSelect = useCallback((variantId: string) => {
    setSelectedVariantId(variantId);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="pdp pdp--loading" aria-busy="true" aria-label="Loading product details">
        <div className="pdp__skeleton pdp__skeleton--image" />
        <div className="pdp__skeleton pdp__skeleton--title" />
        <div className="pdp__skeleton pdp__skeleton--text" />
        <div className="pdp__skeleton pdp__skeleton--text pdp__skeleton--short" />
      </div>
    );
  }

  // Error states
  if (error === 'not_found') {
    return (
      <div className="pdp pdp--error" role="alert" aria-label="Product not found">
        <div className="pdp__error-content">
          <h1 className="pdp__error-title">Product Not Found</h1>
          <p className="pdp__error-message">This product could not be found.</p>
          <Link to="/" className="pdp__error-link">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  if (error === 'network_error') {
    return (
      <div className="pdp pdp--error" role="alert" aria-label="Error loading product">
        <div className="pdp__error-content">
          <h1 className="pdp__error-title">Something Went Wrong</h1>
          <p className="pdp__error-message">
            Something went wrong — please try again.
          </p>
          <button
            className="pdp__error-retry"
            type="button"
            onClick={onRetry}
            aria-label="Retry loading product"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!product) {
    return null;
  }

  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? defaultVariant;
  const allOutOfStock = variants.every((v) => v.stock === 0);
  const displayPrice = selectedVariant?.price ?? product.basePrice;
  const isDisabled = allOutOfStock || (selectedVariant?.stock ?? 0) === 0;

  // Build gallery images: catalog image + selected variant's unit photos
  const galleryImages: GalleryImage[] = useMemo(() => {
    const images: GalleryImage[] = [
      {
        id: 'catalog-primary',
        url: product.catalogImageUrl,
        alt: `${product.title} - primary product image`,
      },
    ];

    if (selectedVariant?.unitPhotos) {
      selectedVariant.unitPhotos.forEach((photo) => {
        images.push({
          id: photo.id,
          url: `/assets/uploads/${photo.storageKey}`,
          alt: `${product.title} - actual unit photo`,
        });
      });
    }

    return images;
  }, [product, selectedVariant]);

  // Unit photos for SecondLifeDetails (resolved URLs)
  const secondLifePhotos = useMemo(() => {
    if (!selectedVariant?.unitPhotos) return undefined;
    return selectedVariant.unitPhotos.map((p) => ({
      id: p.id,
      url: `/assets/uploads/${p.storageKey}`,
    }));
  }, [selectedVariant]);

  return (
    <article className="pdp" aria-label={`Product detail: ${product.title}`}>
      <div className="pdp__layout">
        {/* Image gallery */}
        <section className="pdp__gallery-section">
          <ImageGallery images={galleryImages} />
        </section>

        {/* Product info */}
        <section className="pdp__info-section">
          <header className="pdp__header">
            <p className="pdp__brand">{product.brand}</p>
            <h1 className="pdp__title">{product.title}</h1>
          </header>

          {/* Rating */}
          <div className="pdp__rating" aria-label="Product rating">
            {averageRating !== null && averageRating !== undefined ? (
              <>
                <span className="pdp__rating-stars" aria-hidden="true">
                  {renderStars(averageRating)}
                </span>
                <span className="pdp__rating-value">
                  {averageRating.toFixed(1)}
                </span>
                <span className="pdp__rating-count">
                  ({reviewCount.toLocaleString('en-IN')} {reviewCount === 1 ? 'review' : 'reviews'})
                </span>
              </>
            ) : (
              <span className="pdp__rating-none">No ratings yet</span>
            )}
          </div>

          {/* Price */}
          <div className="pdp__price-section">
            <span className="pdp__price" aria-label={`Price: ₹${displayPrice.toLocaleString('en-IN')}`}>
              ₹{displayPrice.toLocaleString('en-IN')}
            </span>
            {selectedVariant && selectedVariant.price < product.basePrice && (
              <span className="pdp__price-original" aria-label={`Original price: ₹${product.basePrice.toLocaleString('en-IN')}`}>
                ₹{product.basePrice.toLocaleString('en-IN')}
              </span>
            )}
          </div>

          {/* Delivery estimate */}
          {deliveryEstimate && (
            <p className="pdp__delivery" aria-label="Delivery estimate">
              <svg
                className="pdp__delivery-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              {deliveryEstimate.displayText}
            </p>
          )}

          {/* Condition selector */}
          <ConditionSelector
            variants={variants.map((v) => ({
              id: v.id,
              condition: v.condition,
              price: v.price,
              stock: v.stock,
            }))}
            selectedVariantId={selectedVariantId}
            onSelect={handleVariantSelect}
          />

          {/* Second Life details */}
          <SecondLifeDetails
            sourceReturnId={selectedVariant?.sourceReturnId}
            conditionReport={selectedVariant?.conditionReport}
            unitPhotos={secondLifePhotos}
          />

          {/* Purchase actions */}
          <PurchaseActions
            variantId={selectedVariantId}
            disabled={isDisabled}
            onAddToCart={onAddToCart}
            onBuyNow={onBuyNow}
          />

          {/* Stock info */}
          {selectedVariant && !allOutOfStock && selectedVariant.stock > 0 && (
            <p className="pdp__stock-info">
              {selectedVariant.stock <= 5
                ? `Only ${selectedVariant.stock} left in stock`
                : 'In Stock'}
            </p>
          )}
        </section>
      </div>
    </article>
  );
}

/** Renders star characters for a given rating 1–5 */
function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}
