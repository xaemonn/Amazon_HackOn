import { Link } from 'react-router-dom';
import './SecondLifeRail.css';

export interface SecondLifeCardData {
  productId: string;
  variantId: string;
  title: string;
  imageUrl: string;
  condition: 'Open_Box' | 'Certified_Renewed';
  price: number;
}

export interface SecondLifeRailProps {
  items: SecondLifeCardData[];
}

function formatCondition(condition: 'Open_Box' | 'Certified_Renewed'): string {
  switch (condition) {
    case 'Open_Box':
      return 'Open Box';
    case 'Certified_Renewed':
      return 'Certified Renewed';
    default:
      return condition;
  }
}

export function SecondLifeRail({ items }: SecondLifeRailProps) {
  if (items.length === 0) {
    return null;
  }

  const visibleItems = items.slice(0, 10);

  return (
    <section className="second-life-rail" aria-labelledby="second-life-rail-heading">
      <h2 id="second-life-rail-heading" className="second-life-rail__title">
        Second Life / Renewed
      </h2>
      <div className="second-life-rail__scroll-container" role="list" aria-label="Second Life products">
        {visibleItems.map((item) => (
          <Link
            key={item.variantId}
            to={`/product/${item.productId}`}
            className="second-life-rail__card"
            role="listitem"
            aria-label={`${item.title}, ${formatCondition(item.condition)}, ₹${item.price}`}
          >
            <div className="second-life-rail__image-container">
              <img
                src={item.imageUrl}
                alt={item.title}
                className="second-life-rail__image"
                loading="lazy"
              />
              <span
                className={`second-life-rail__badge second-life-rail__badge--${item.condition.toLowerCase().replace('_', '-')}`}
                aria-hidden="true"
              >
                {formatCondition(item.condition)}
              </span>
            </div>
            <div className="second-life-rail__info">
              <span className="second-life-rail__card-title">{item.title}</span>
              <span className="second-life-rail__price">
                ₹{item.price.toLocaleString('en-IN')}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
