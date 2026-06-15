import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  apiGetResaleListing,
  apiPurchaseResale,
  type ResaleListing,
} from '../api/client';
import './MarketplaceListingDetailPage.css';

const CURRENCY: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
const sym = (c: string) => CURRENCY[c] ?? c;

const GRADE_META: Record<string, { tag: string; colour: string }> = {
  A: { tag: 'Like New',  colour: '#1a7f37' },
  B: { tag: 'Returned',  colour: '#0969da' },
  C: { tag: 'Refurbished', colour: '#9a6700' },
};

const CO2_SAVED_KG: Record<string, number> = { A: 12, B: 8, C: 5 };

export function MarketplaceListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [listing, setListing] = useState<ResaleListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [buying, setBuying] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [greenKg, setGreenKg] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiGetResaleListing(id)
      .then((l) => { setListing(l); setActivePhoto(0); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load listing.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleBuy = async () => {
    if (!listing || !user) return;
    setBuying(true);
    try {
      const buyerCity =
        (user as { address?: { city?: string } }).address?.city ?? 'Unknown';
      await apiPurchaseResale(listing.id, user.id, buyerCity);
      setGreenKg(CO2_SAVED_KG[listing.grade] ?? 6);
      setPurchased(true);
      // Refresh listing to show sold state
      const updated = await apiGetResaleListing(listing.id);
      setListing(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed.');
    } finally {
      setBuying(false);
    }
  };

  if (loading) return <div className="mld__loading">Loading listing…</div>;
  if (error)   return <div className="mld__error" role="alert">{error}</div>;
  if (!listing) return null;

  const photos = listing.returnPhotoUrls?.length
    ? listing.returnPhotoUrls
    : listing.imageUrl ? [listing.imageUrl] : [];

  const meta = GRADE_META[listing.grade];
  const discountPct = Math.round((1 - listing.listedPrice / listing.originalPrice) * 100);

  return (
    <div className="mld">
      {/* Back */}
      <button className="mld__back" onClick={() => navigate('/marketplace')}>
        ← Back to Marketplace
      </button>

      <div className="mld__layout">
        {/* ── Photo gallery ── */}
        <div className="mld__gallery">
          <div className="mld__main-photo">
            {photos.length > 0 ? (
              <img
                src={photos[activePhoto]}
                alt={`${listing.productName} — photo ${activePhoto + 1}`}
                className="mld__main-img"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="mld__photo-fallback">📦</div>
            )}
            <span className={`mld__grade-badge mld__grade-badge--${listing.grade}`}>
              {listing.grade} · {meta.tag}
            </span>
          </div>

          {photos.length > 1 && (
            <div className="mld__thumbs">
              {photos.map((url, i) => (
                <button
                  key={i}
                  className={`mld__thumb${activePhoto === i ? ' mld__thumb--active' : ''}`}
                  onClick={() => setActivePhoto(i)}
                >
                  <img src={url} alt={`View ${i + 1}`} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Info panel ── */}
        <div className="mld__info">
          <h1 className="mld__name">{listing.productName}</h1>

          <div className="mld__price-row">
            <span className="mld__price-now">
              {sym(listing.currency)}{listing.listedPrice.toLocaleString('en-IN')}
            </span>
            {discountPct > 0 && (
              <>
                <span className="mld__price-was">
                  {sym(listing.currency)}{listing.originalPrice.toLocaleString('en-IN')}
                </span>
                <span className="mld__price-off">-{discountPct}% off</span>
              </>
            )}
          </div>

          <div className="mld__chips">
            <span className="mld__chip">📍 {listing.sellerCity}</span>
            {listing.listingType === 'direct_transfer' && (
              <span className="mld__chip mld__chip--green">⚡ Direct transfer</span>
            )}
            <span className="mld__chip">
              ♻️ Save ~{CO2_SAVED_KG[listing.grade] ?? 6} kg CO₂
            </span>
          </div>

          {/* Buy action */}
          {listing.status === 'active' && !purchased && (
            <button
              className="mld__buy-btn"
              disabled={buying || !user}
              onClick={handleBuy}
            >
              {buying
                ? 'Processing…'
                : user
                  ? `Buy Now — ${sym(listing.currency)}${listing.listedPrice.toLocaleString('en-IN')}`
                  : 'Log in to purchase'}
            </button>
          )}

          {purchased && (
            <div className="mld__purchased">
              <div className="mld__purchased-icon">✅</div>
              <p className="mld__purchased-title">Order placed!</p>
              {greenKg && (
                <p className="mld__green-msg">
                  You saved ~{greenKg} kg of CO₂ by choosing a returned item.
                  <span className="mld__green-badge">🌿 Green Buyer</span>
                </p>
              )}
            </div>
          )}

          {listing.status === 'sold' && !purchased && (
            <div className="mld__sold-notice">This item has been sold.</div>
          )}

          {/* AI Condition Report */}
          {listing.conditionReasoning && (
            <div className="mld__condition">
              <h2 className="mld__section-title">AI Condition Report</h2>
              <p className="mld__condition-text">{listing.conditionReasoning}</p>

              {listing.defects?.length > 0 && (
                <div className="mld__defects">
                  <h3 className="mld__defects-title">Noted defects</h3>
                  <ul className="mld__defects-list">
                    {listing.defects.map((d, i) => (
                      <li key={i} className="mld__defect">
                        <span className={`mld__defect-badge mld__defect-badge--${d.severity}`}>
                          {d.severity}
                        </span>
                        <strong>{d.location}:</strong> {d.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Listing metadata */}
          <div className="mld__meta-section">
            <h2 className="mld__section-title">Listing details</h2>
            <dl className="mld__meta-grid">
              <dt>Condition</dt>
              <dd>{meta.tag} (Grade {listing.grade})</dd>
              <dt>Seller city</dt>
              <dd>{listing.sellerCity}</dd>
              <dt>Listed</dt>
              <dd>{new Date(listing.listedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
              {listing.expiresAt && (
                <>
                  <dt>Offer window</dt>
                  <dd>{new Date(listing.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</dd>
                </>
              )}
              <dt>Listing type</dt>
              <dd>{listing.listingType === 'direct_transfer' ? 'Direct transfer from seller' : 'Shipped from verified location'}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
