import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './ReturnPage.css';
import './ReasonPicker.css';

type ReturnReason =
  | 'defective'
  | 'damaged_in_transit'
  | 'wrong_item'
  | 'size_fit'
  | 'not_as_described'
  | 'changed_mind';

interface ReasonOption {
  value: ReturnReason;
  label: string;
}

const REASON_OPTIONS: ReasonOption[] = [
  { value: 'defective', label: 'Defective' },
  { value: 'damaged_in_transit', label: 'Damaged in transit' },
  { value: 'wrong_item', label: 'Wrong item sent' },
  { value: 'size_fit', label: 'Size/fit issue' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'changed_mind', label: 'Changed my mind' },
];

const MAX_DETAILS_LENGTH = 500;

export function ReasonPicker() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { customerId?: string; orderItemId?: string } | null;

  const [selectedReason, setSelectedReason] = useState<ReturnReason | null>(null);
  const [reasonDetails, setReasonDetails] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  const trimmedDetails = reasonDetails.trim();
  const charCount = trimmedDetails.length;
  const isOverLimit = charCount > MAX_DETAILS_LENGTH;
  const canProceed = selectedReason !== null && !isOverLimit;

  const handleReasonChange = (reason: ReturnReason) => {
    setSelectedReason(reason);
    setShowValidation(false);
  };

  const handleDetailsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReasonDetails(e.target.value);
  };

  const handleNext = () => {
    if (!canProceed) {
      setShowValidation(true);
      return;
    }

    const detailsToPass = trimmedDetails.length > 0 ? trimmedDetails : null;

    navigate('/returns/media', {
      state: {
        customerId: state?.customerId,
        orderItemId: state?.orderItemId,
        reason: selectedReason,
        reasonDetails: detailsToPass,
      },
    });
  };

  const handleBack = () => {
    navigate('/returns/eligibility', {
      state: {
        customerId: state?.customerId,
        orderItemId: state?.orderItemId,
      },
    });
  };

  const getCharCountClass = () => {
    if (isOverLimit) return 'reason-details-charcount--error';
    if (charCount > MAX_DETAILS_LENGTH * 0.9) return 'reason-details-charcount--warning';
    return '';
  };

  return (
    <section className="reason-picker" aria-labelledby="reason-picker-heading">
      <h1 id="reason-picker-heading">Why are you returning this item?</h1>
      <p className="reason-picker-subtitle">
        Select the reason that best describes your return.
      </p>

      <fieldset className="reason-picker-fieldset" aria-required="true">
        <legend className="reason-picker-legend">Return reason</legend>
        {REASON_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`reason-option${selectedReason === option.value ? ' reason-option--selected' : ''}`}
          >
            <input
              type="radio"
              name="return-reason"
              value={option.value}
              checked={selectedReason === option.value}
              onChange={() => handleReasonChange(option.value)}
              aria-describedby={
                showValidation && !selectedReason ? 'reason-validation-msg' : undefined
              }
            />
            <span className="reason-option-label">{option.label}</span>
          </label>
        ))}
      </fieldset>

      {selectedReason && (
        <div className="reason-details-section">
          <label htmlFor="reason-details-input" className="reason-details-label">
            Additional details (optional)
          </label>
          <textarea
            id="reason-details-input"
            className="reason-details-textarea"
            placeholder="Tell us more about the issue — this helps us process your return faster."
            value={reasonDetails}
            onChange={handleDetailsChange}
            maxLength={MAX_DETAILS_LENGTH + 50}
            aria-describedby="reason-details-charcount"
          />
          <div className="reason-details-footer">
            <span>{/* spacer */}</span>
            <span
              id="reason-details-charcount"
              className={getCharCountClass()}
              aria-live="polite"
            >
              {charCount}/{MAX_DETAILS_LENGTH}
            </span>
          </div>
        </div>
      )}

      {showValidation && !selectedReason && (
        <div
          className="reason-picker-validation"
          id="reason-validation-msg"
          role="alert"
        >
          <span aria-hidden="true">⚠</span>
          Please select a return reason to continue.
        </div>
      )}

      <div className="reason-picker-actions">
        <button
          type="button"
          className="reason-picker-btn reason-picker-btn--back"
          onClick={handleBack}
        >
          Back
        </button>
        <button
          type="button"
          className="reason-picker-btn reason-picker-btn--next"
          disabled={!canProceed}
          onClick={handleNext}
          aria-disabled={!canProceed}
        >
          Next
        </button>
      </div>
    </section>
  );
}
