import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  apiGetResaleListings,
  apiPurchaseResale,
  apiForceExpireResale,
  apiAcceptKeepOffer,
  apiRegradeResale,
  type ResaleListing,
  type PurchaseResult,
} from '../api/client';
import { getViewedProductIds, listingRelevanceScore } from '../hooks/useProductHistory';
import './MarketplacePage.css';

// ─── CO2 savings (kg) per purchase, by condition grade ──────────────────────
// Buying refurbished avoids new manufacturing. Estimates based on avg consumer
// electronics lifecycle-assessment studies.
const CO2_SAVED_KG: Record<string, number> = { A: 12, B: 8, C: 5 };

function co2Saved(grade: string): number {
  return CO2_SAVED_KG[grade] ?? 6;
}

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
  const navigate = useNavigate();
  // Default to the user's registered city so they only see their city's listings.
  // Falls back to first CITIES entry if no address is saved.
  const userCity = (user as { address?: { city?: string } } | null)?.address?.city;
  const [city, setCity] = useState(userCity ?? CITIES[0] ?? 'Bengaluru');
  const [listings, setListings] = useState<ResaleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);
  const [greenCredit, setGreenCredit] = useState<{ kg: number; grade: string } | null>(null);

  // Sort listings so products the user has previously viewed appear first.
  const sortedListings = useMemo(() => {
    const viewed = getViewedProductIds();
    if (viewed.length === 0) return listings;
    return [...listings].sort(
      (a, b) => listingRelevanceScore(a.productId) - listingRelevanceScore(b.productId),
    );
  }, [listings]);

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
      setGreenCredit({ kg: co2Saved(listing.grade), grade: listing.grade });
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

  // Re-grade flow: seller picks fresh photos for a marked-down listing.
  const regradeInputRef = useRef<HTMLInputElement>(null);
  const regradeTargetRef = useRef<ResaleListing | null>(null);

  const triggerRegrade = (listing: ResaleListing) => {
    regradeTargetRef.current = listing;
    regradeInputRef.current?.click();
  };

  const handleRegradeFiles = async (files: FileList | null) => {
    const listing = regradeTargetRef.current;
    if (!listing || !files || files.length === 0) return;
    setBusyId(listing.id);
    setError(null);
    try {
      await apiRegradeResale(listing, Array.from(files));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Re-grade failed.');
    } finally {
      setBusyId(null);
      regradeTargetRef.current = null;
      if (regradeInputRef.current) regradeInputRef.current.value = '';
    }
  };

  return (
    <section className="market" aria-labelledby="market-title">
      {/* Hidden file input used by the per-card "Re-grade with new photos" action */}
      <input
        ref={regradeInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => void handleRegradeFiles(e.target.files)}
      />
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
          {sortedListings.map((l) => {
            const meta = GRADE_META[l.grade];
            const sameCity = l.sellerCity.toLowerCase() === city.toLowerCase();
            const directEligible =
              (l.listingType === 'direct_transfer' || l.listingType === 'refurbished_discounted') &&
              sameCity && l.status === 'active';
            const window = daysLeft(l.expiresAt);
            const discountPct = Math.round((1 - l.listedPrice / l.originalPrice) * 100);
            const isForYou = listingRelevanceScore(l.productId) < 9999;

            // Use return photos if available; fall back to catalog imageUrl
            const photos = l.returnPhotoUrls?.length ? l.returnPhotoUrls : (l.imageUrl ? [l.imageUrl] : []);
            const activePhoto = photos[0];

            return (
              <article
                key={l.id}
                className={`mcard mcard--${l.grade}${isForYou ? ' mcard--for-you' : ''}`}
                onClick={() => navigate(`/marketplace/${l.id}`)}
                style={{ cursor: 'pointer' }}
              >
                {/* Photo gallery — customer's actual return photos */}
                <div className="mcard__media">
                  {isForYou && <span className="mcard__foryou-badge">⭐ Recommended for you</span>}
                  {photos.length > 0 ? (
                    <img
                      src={activePhoto}
                      alt={`${l.productName} — customer return photo`}
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = ''; (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <span className="mcard__media-fallback" aria-hidden="true">📦</span>
                  )}
                  <span className={`mcard__grade mcard__grade--${l.grade}`}>
                    {l.grade} · {meta.tag}
                  </span>
                  {photos.length > 1 && (
                    <div className="mcard__thumbs">
                      {photos.slice(0, 4).map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`View ${i + 1}`}
                          className="mcard__thumb"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="mcard__body">
                  <h2 className="mcard__name">{l.productName}</h2>
                  <p className="mcard__blurb">{meta.blurb}</p>

                  {/* AI condition report — why this grade was given */}
                  {l.conditionReasoning && (
                    <div className="mcard__condition">
                      <p className="mcard__condition-title">AI Condition Report</p>
                      <p className="mcard__condition-text">{l.conditionReasoning}</p>
                      {l.defects?.length > 0 && (
                        <ul className="mcard__defects">
                          {l.defects.map((d, i) => (
                            <li key={i}>
                              <span className={`mcard__defect-badge mcard__defect-badge--${d.severity}`}>{d.severity}</span>
                              {d.location}: {d.description}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

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

                  {/* Marked-down + needs-regrade notice (Grade B that didn't sell) */}
                  {l.status === 'active' && l.needsRegrade && (
                    <div className="mcard__regrade-notice" role="note">
                      📉 Price reduced after {l.markdownCount} markdown{l.markdownCount !== 1 ? 's' : ''}.
                      Submit fresh photos to re-grade and refresh this listing.
                    </div>
                  )}

                  {/* Status-aware footer */}
                  {l.status === 'active' && (
                    <div className="mcard__actions">
                      {l.sellerCustomerId === buyerId ? (
                        <div className="mcard__own-listing" role="note">
                          🏷️ Your listing — you can't buy your own item.
                        </div>
                      ) : (
                        <button
                          className="mcard__buy"
                          disabled={busyId === l.id}
                          onClick={(e) => { e.stopPropagation(); void handleBuy(l); }}
                        >
                          {busyId === l.id ? 'Processing…' : `Buy ${sym(l.currency)}${l.listedPrice.toLocaleString('en-IN')}`}
                        </button>
                      )}
                      {l.needsRegrade && (
                        <button
                          className="mcard__ghost mcard__ghost--regrade"
                          disabled={busyId === l.id}
                          onClick={(e) => { e.stopPropagation(); triggerRegrade(l); }}
                          title="Upload fresh photos to re-grade this item"
                        >
                          📸 Re-grade with new photos
                        </button>
                      )}
                      <button
                        className="mcard__ghost"
                        onClick={(e) => { e.stopPropagation(); navigate(`/marketplace/${l.id}`); }}
                      >
                        View details
                      </button>
                      {l.expiresAt && (
                        <button
                          className="mcard__ghost"
                          disabled={busyId === l.id}
                          onClick={(e) => { e.stopPropagation(); void handleForceExpire(l); }}
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
                        onClick={(e) => { e.stopPropagation(); void handleAcceptKeep(l); }}
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

      {/* Purchase confirmation + green credit celebration */}
      {purchaseResult && (
        <div className="market__toast" role="status" onClick={() => { setPurchaseResult(null); setGreenCredit(null); }}>
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

            {/* Green credit banner */}
            {greenCredit && (
              <div className="market__green-credit">
                <div className="market__green-credit-icon">🌱</div>
                <div>
                  <strong>You saved ~{greenCredit.kg} kg of CO₂!</strong>
                  <p>
                    By choosing a certified refurbished Grade {greenCredit.grade} item instead of buying new,
                    you helped avoid the emissions from manufacturing a brand-new product.
                    That's equivalent to skipping ~{Math.round(greenCredit.kg * 6)} km of car travel. 🚗
                  </p>
                  <span className="market__green-badge">🏅 Green Buyer</span>
                </div>
              </div>
            )}

            <button className="mcard__buy" onClick={() => { setPurchaseResult(null); setGreenCredit(null); }}>Done</button>
          </div>
        </div>
      )}
    </section>
  );
}
