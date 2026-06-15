import { useState } from 'react';
import { apiSubmitReview } from '../../api/client';
import './ReviewModal.css';

interface Props {
  productId: string;
  productName: string;
  returnRequestId?: string | null;
  /** Pre-filled photo URLs from the return */
  photoUrls?: string[];
  /** Pre-filled body from the customer's stated problem */
  prefillBody?: string;
  customerName: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export function ReviewModal({
  productId,
  productName,
  returnRequestId,
  photoUrls = [],
  prefillBody = '',
  customerName,
  onClose,
  onSubmitted,
}: Props) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(prefillBody);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (rating === 0) { setError('Please select a star rating.'); return; }
    if (!title.trim()) { setError('Please add a review title.'); return; }
    if (!body.trim()) { setError('Please describe your experience.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      await apiSubmitReview({
        productId,
        rating,
        title: title.trim(),
        body: body.trim(),
        returnRequestId,
        photoUrls: includePhotos ? photoUrls : [],
        customerName,
      });
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="review-modal__backdrop" onClick={onClose}>
      <div className="review-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Write a review">
        <button className="review-modal__close" onClick={onClose} aria-label="Close">✕</button>

        <h2 className="review-modal__title">Write a Review</h2>
        <p className="review-modal__product">{productName}</p>

        {/* Star rating */}
        <div className="review-modal__stars" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`review-modal__star${(hoverRating || rating) >= n ? ' review-modal__star--filled' : ''}`}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(n)}
              aria-label={`${n} star${n !== 1 ? 's' : ''}`}
              type="button"
            >
              ★
            </button>
          ))}
          {rating > 0 && (
            <span className="review-modal__rating-label">
              {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating]}
            </span>
          )}
        </div>

        {/* Title */}
        <label className="review-modal__label">
          Review title
          <input
            className="review-modal__input"
            type="text"
            placeholder="What's the most important thing to know?"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        {/* Body */}
        <label className="review-modal__label">
          Your experience
          <textarea
            className="review-modal__textarea"
            placeholder="Describe what you liked or didn't like. What issue did you face?"
            maxLength={2000}
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>

        {/* Attach return photos */}
        {photoUrls.length > 0 && (
          <label className="review-modal__checkbox">
            <input
              type="checkbox"
              checked={includePhotos}
              onChange={(e) => setIncludePhotos(e.target.checked)}
            />
            Include my return photos ({photoUrls.length} photo{photoUrls.length !== 1 ? 's' : ''})
          </label>
        )}

        {error && <p className="review-modal__error" role="alert">{error}</p>}

        <div className="review-modal__actions">
          <button
            className="review-modal__submit"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Review'}
          </button>
          <button className="review-modal__cancel" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
