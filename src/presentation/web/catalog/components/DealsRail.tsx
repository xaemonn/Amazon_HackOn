import { Link } from 'react-router-dom';
import './DealsRail.css';

export interface DealCardData {
  productId: string;
  variantId: string;
  title: string;
  thumbnailUrl: string;
  basePrice: number;
  discountedPrice: number;
}

export interface DealsRailProps {
  deals: DealCardData[];
}

export function DealsRail({ deals }: DealsRailProps) {
  if (deals.length === 0) {
    return null;
  }

  const visibleDeals = deals.slice(0, 10);

  return (
    <section className="deals-rail" aria-labelledby="deals-rail-heading">
      <h2 id="deals-rail-heading" className="deals-rail__title">
        Today's Deals
      </h2>
      <div className="deals-rail__scroll-container" role="list" aria-label="Deals">
        {visibleDeals.map((deal) => {
          const discountPercent = Math.round(
            ((deal.basePrice - deal.discountedPrice) / deal.basePrice) * 100
          );

          return (
            <Link
              key={deal.variantId}
              to={`/product/${deal.productId}`}
              className="deals-rail__card"
              role="listitem"
              aria-label={`${deal.title}, ₹${deal.discountedPrice}, was ₹${deal.basePrice}`}
            >
              <div className="deals-rail__image-container">
                <img
                  src={deal.thumbnailUrl}
                  alt={deal.title}
                  className="deals-rail__image"
                  loading="lazy"
                />
                {discountPercent > 0 && (
                  <span className="deals-rail__discount-badge" aria-hidden="true">
                    -{discountPercent}%
                  </span>
                )}
              </div>
              <div className="deals-rail__info">
                <span className="deals-rail__card-title">{deal.title}</span>
                <div className="deals-rail__pricing">
                  <span className="deals-rail__price-current">
                    ₹{deal.discountedPrice.toLocaleString('en-IN')}
                  </span>
                  <span className="deals-rail__price-original" aria-label={`Original price ₹${deal.basePrice}`}>
                    <s>₹{deal.basePrice.toLocaleString('en-IN')}</s>
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
