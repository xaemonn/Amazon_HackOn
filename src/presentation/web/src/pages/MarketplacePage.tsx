import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  apiGetResaleListings,
  apiPurchaseResale,
  apiForceExpireResale,
  apiAcceptKeepOffer,
  type ResaleListing,
  type PurchaseResult,
} from '../api/client';
import './MarketplacePage.css';

const CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad'];

const CURRENCY: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
const sym = (c: string) => CURRENCY[c] ?? c;

const GRADE_META: Record<string, { tag: string; blurb: string }> = {
  A: { tag: 'Like New', blurb: 'Direct transfer from a nearby seller' },
  B: { tag: 'Returned', blurb: 'Inspected & discounted' },
  C: { tag: 'Refurbished', blurb: 'Restored & discounted' },
};

function daysLeft(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'window closing';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days >= 1) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

export function MarketplacePage() {
  const { user } = useAuth();
  // Default to the user's registered city so they only see their city's listings.
  // Falls back to first CITIES entry if no address is saved.
  const userCity = (user as { address?: { city?: string } } | null)?.address?.city;
  const [city, setCity] = useState(userCity ?? CITIES[0] ?? 'Bengaluru');
  const [listings, setListings] = useState<ResaleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetResaleListings(city);
      setListings(data.listings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load marketplace.');
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    void load();
  }, [load]);

  const buyerId = user?.id ?? 'buyer-guest';

  const handleBuy = async (listing: ResaleListing) => {
    setBusyId(listing.id);
    setError(null);
    try {
      const result = await apiPurchaseResale(listing.id, buyerId, city);
      setPurchaseResult(result);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleForceExpire = async (listing: ResaleListing) => {
    setBusyId(listing.id);
    try {
      await apiForceExpireResale(listing.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAcceptKeep = async (listing: ResaleListing) => {
    setBusyId(listing.id);
    try {
      await apiAcceptKeepOffer(listing.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="market" aria-labelledby="market-title">
      <header className="market__header">
        <div>
          <h1 id="market-title" className="market__title">Returns Marketplace</h1>
          <p className="market__subtitle">
            Graded returns relisted near you — buy Like-New items delivered
            directly from a nearby seller, often within hours.
          </p>
        </div>
        <label className="market__city">
          <span>Your city</span>
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            {/* Show user's city even if not in the preset list */}
            {userCity && !CITIES.includes(userCity) && (
              <option value={userCity}>{userCity}</option>
            )}
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </header>

      {error && <p className="market__error" role="alert">{error}</p>}

      {loading ? (
        <p className="market__empty">Loading listings…</p>
      ) : listings.length === 0 ? (
        <p className="market__empty">
          No relisted items in <strong>{city}</strong> yet. Returns from sellers
          in your city appear here. Complete a return and grade an item (A/B/C)
          to see it appear — only buyers in the same city can see it.
        </p>
      ) : (
        <div className="market__grid">
          {listings.map((l) => {
            const meta = GRADE_META[l.grade];
            const sameCity = l.sellerCity.toLowerCase() === city.toLowerCase();
            const directEligible =
              (l.listingType === 'direct_transfer' || l.listingType === 'refurbished_discounted') &&
              sameCity && l.status === 'active';
            const window = daysLeft(l.expiresAt);
            const discountPct = Math.round((1 - l.listedPrice / l.originalPrice) * 100);

            return (
              <article key={l.id} className={`mcard mcard--${l.grade}`}>
                <div className="mcard__media">
                  {l.imageUrl ? (
                    <img
                      src={l.imageUrl}
                      alt={l.productName}
                      loading="lazy"
                      onError={(e) => { (e.currentTarget.style.display = 'none'); }}
                    />
                  ) : (
                    <span className="mcard__media-fallback" aria-hidden="true">📦</span>
                  )}
                  <span className={`mcard__grade mcard__grade--${l.grade}`}>
                    {l.grade} · {meta.tag}
                  </span>
                </div>

                <div className="mcard__body">
                  <h2 className="mcard__name">{l.productName}</h2>
                  <p className="mcard__blurb">{meta.blurb}</p>

                  <div className="mcard__price">
                    <span className="mcard__price-now">{sym(l.currency)}{l.listedPrice.toLocaleString('en-IN')}</span>
                    <span className="mcard__price-was">{sym(l.currency)}{l.originalPrice.toLocaleString('en-IN')}</span>
                    <span className="mcard__price-off">-{discountPct}%</span>
                  </div>

                  <div className="mcard__meta">
                    <span className="mcard__chip">📍 {l.sellerCity}</span>
                    {directEligible && <span className="mcard__chip mcard__chip--green">⚡ Direct transfer</span>}
                    {window && l.status === 'active' && <span className="mcard__chip">⏳ {window}</span>}
                  </div>

                  {/* Status-aware footer */}
                  {l.status === 'active' && (
                    <div className="mcard__actions">
                      <button
                        className="mcard__buy"
                        disabled={busyId === l.id}
                        onClick={() => handleBuy(l)}
                      >
                        {busyId === l.id ? 'Processing…' : `Buy ${sym(l.currency)}${l.listedPrice.toLocaleString('en-IN')}`}
                      </button>
                      {l.expiresAt && (
                        <button
                          className="mcard__ghost"
                          disabled={busyId === l.id}
                          onClick={() => handleForceExpire(l)}
                          title="Demo: simulate the local-buyer window lapsing"
                        >
                          Simulate window end
                        </button>
                      )}
                    </div>
                  )}

                  {l.status === 'sold' && l.fulfilment && (
                    <div className="mcard__status mcard__status--sold">
                      ✓ Sold ·{' '}
                      {l.fulfilment.mode === 'direct_transfer'
                        ? `Direct transfer by ${l.fulfilment.deliveryPartner} (~${l.fulfilment.etaHours}h)`
                        : `Shipping from warehouse (~${l.fulfilment.etaHours}h)`}
                    </div>
                  )}

                  {l.status === 'returned_to_warehouse' && (
                    <div className="mcard__status mcard__status--warehouse">
                      ↩ No local buyer — returned to warehouse
                    </div>
                  )}

                  {l.status === 'keep_offer_extended' && l.keepOffer && (
                    <div className="mcard__keep">
                      <p>
                        No local buyer found. Keep the item and get a{' '}
                        <strong>{sym(l.keepOffer.currency)}{l.keepOffer.giftCardAmount.toLocaleString('en-IN')}</strong> gift card.
                      </p>
                      <button
                        className="mcard__buy"
                        disabled={busyId === l.id}
                        onClick={() => handleAcceptKeep(l)}
                      >
                        Accept gift card & keep
                      </button>
                    </div>
                  )}

                  {l.status === 'kept_by_customer' && (
                    <div className="mcard__status mcard__status--kept">
                      🎁 Kept by owner — gift card issued
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Purchase confirmation */}
      {purchaseResult && (
        <div className="market__toast" role="status" onClick={() => setPurchaseResult(null)}>
          <div className="market__toast-card" onClick={(e) => e.stopPropagation()}>
            <h3>{purchaseResult.directTransfer ? '⚡ Direct transfer arranged!' : '✓ Order placed'}</h3>
            {purchaseResult.fulfilment && (
              <p>
                {purchaseResult.directTransfer ? (
                  <>
                    A delivery partner (<strong>{purchaseResult.fulfilment.deliveryPartner}</strong>)
                    will move <strong>{purchaseResult.listing.productName}</strong> directly from the
                    seller to you in about <strong>{purchaseResult.fulfilment.etaHours} hours</strong> —
                    no warehouse hop.
                  </>
                ) : (
                  <>
                    <strong>{purchaseResult.listing.productName}</strong> will ship from the warehouse
                    in about <strong>{purchaseResult.fulfilment.etaHours} hours</strong>.
                  </>
                )}
              </p>
            )}
            <button className="mcard__buy" onClick={() => setPurchaseResult(null)}>Done</button>
          </div>
        </div>
      )}
    </section>
  );
}
