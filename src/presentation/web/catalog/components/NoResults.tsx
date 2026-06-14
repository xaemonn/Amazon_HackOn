import { Link } from 'react-router-dom';
import './NoResults.css';

export interface SecondLifeCardData {
  productId: string;
  variantId: string;
  title: string;
  imageUrl: string;
  condition: 'Open_Box' | 'Certified_Renewed';
  price: number;
}

export interface NoResultsProps {
  query: string;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  secondLifeItems?: SecondLifeCardData[];
}

function getConditionLabel(condition: 'Open_Box' | 'Certified_Renewed'): string {
  return condition === 'Open_Box' ? 'Open Box' : 'Certified Renewed';
}

export function NoResults({ query, hasActiveFilters, onClearFilters, secondLifeItems }: NoResultsProps) {
  const displayQuery = query.length > 200 ? query.slice(0, 200) : query;

  return (
    <div className="no-results" role="status" aria-live="polite">
      <div className="no-results__message">
        <h2 className="no-results__title">
          No results found for &lsquo;{displayQuery}&rsquo;
        </h2>
        <div className="no-results__suggestions">
          <p className="no-results__suggestion-heading">Suggestions:</p>
          <ul className="no-results__suggestion-list">
            <li>Try different keywords</li>
            {hasActiveFilters && (
              <li>
                <button
                  type="button"
                  className="no-results__action-btn"
                  onClick={onClearFilters}
                  aria-label="Remove all active filters"
                >
                  Remove filters
                </button>
              </li>
            )}
            <li>
              <Link to="/" className="no-results__link">
                Browse categories
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Second Life Rail */}
      {secondLifeItems && secondLifeItems.length > 0 && (
        <section className="no-results__second-life" aria-labelledby="no-results-second-life-heading">
          <h3 id="no-results-second-life-heading" className="no-results__rail-title">
            Second Life / Renewed
          </h3>
          <ul className="no-results__rail-list" role="list">
            {secondLifeItems.map((item) => (
              <li key={item.variantId} className="no-results__rail-item">
                <Link
                  to={`/product/${item.productId}`}
                  className="no-results__rail-card"
                  aria-label={`${item.title} - ${getConditionLabel(item.condition)} - ₹${item.price.toLocaleString('en-IN')}`}
                >
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="no-results__rail-image"
                    loading="lazy"
                  />
                  <div className="no-results__rail-details">
                    <span className="no-results__rail-condition">
                      {getConditionLabel(item.condition)}
                    </span>
                    <span className="no-results__rail-item-title">{item.title}</span>
                    <span className="no-results__rail-price">
                      ₹{item.price.toLocaleString('en-IN')}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
