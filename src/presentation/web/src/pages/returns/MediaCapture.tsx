import { useCallback, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './ReturnPage.css';
import './MediaCapture.css';

// --- Types ---

type SlotType = 'photo_front' | 'photo_back' | 'photo_closeup' | 'video';

interface CaptureSlot {
  type: SlotType;
  label: string;
  instruction: string;
  framingHint: string;
  accept: string;
  maxSizeMB: number;
  isVideo: boolean;
}

interface CapturedMedia {
  file: File;
  previewUrl: string;
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'error';
  errorMessage?: string;
}

// --- Slot Configuration ---

const CAPTURE_SLOTS: CaptureSlot[] = [
  {
    type: 'photo_front',
    label: 'Front View',
    instruction: 'Take a clear photo of the front of your item',
    framingHint: 'Position item centered, filling most of the frame',
    accept: 'image/jpeg,image/png',
    maxSizeMB: 10,
    isVideo: false,
  },
  {
    type: 'photo_back',
    label: 'Back View',
    instruction: 'Take a clear photo of the back of your item',
    framingHint: 'Flip the item over, keep it centered',
    accept: 'image/jpeg,image/png',
    maxSizeMB: 10,
    isVideo: false,
  },
  {
    type: 'photo_closeup',
    label: 'Close-up',
    instruction: 'Take a close-up photo of any damage or label',
    framingHint: 'Focus on the damaged area or product label',
    accept: 'image/jpeg,image/png',
    maxSizeMB: 10,
    isVideo: false,
  },
  {
    type: 'video',
    label: 'Video (5–30s)',
    instruction: 'Record a short video showing the item\'s overall condition',
    framingHint: 'Slowly rotate the item, showing all sides',
    accept: 'video/mp4,video/quicktime',
    maxSizeMB: 50,
    isVideo: true,
  },
];

// --- Validation Helpers ---

function validateFile(file: File, slot: CaptureSlot): string | null {
  const maxBytes = slot.maxSizeMB * 1024 * 1024;

  if (file.size > maxBytes) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed is ${slot.maxSizeMB} MB.`;
  }

  const allowedTypes = slot.accept.split(',').map((t) => t.trim());
  // video/quicktime maps to .mov files
  if (!allowedTypes.includes(file.type) && !(file.type === '' && file.name.match(/\.(mov|MOV)$/))) {
    if (slot.isVideo) {
      return 'Unsupported format. Please use MP4 or MOV video.';
    }
    return 'Unsupported format. Please use JPEG or PNG image.';
  }

  return null;
}

// --- Component ---

interface LocationState {
  customerId?: string;
  orderItemId?: string;
  reason?: string;
  reasonDetails?: string;
}

export function MediaCapture() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [captures, setCaptures] = useState<Record<SlotType, CapturedMedia | null>>({
    photo_front: null,
    photo_back: null,
    photo_closeup: null,
    video: null,
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  const currentSlot = CAPTURE_SLOTS[activeSlotIndex];
  const currentCapture = captures[currentSlot.type];
  const allCaptured = CAPTURE_SLOTS.every((s) => captures[s.type] !== null);

  // Handle file selection (from gallery or "camera" picker)
  const handleFileSelected = useCallback(
    (file: File) => {
      setValidationError(null);
      setUploadError(null);

      const error = validateFile(file, currentSlot);
      if (error) {
        setValidationError(error);
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      setCaptures((prev) => ({
        ...prev,
        [currentSlot.type]: {
          file,
          previewUrl,
          uploadStatus: 'pending' as const,
        },
      }));
    },
    [currentSlot],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelected(file);
      }
      // Reset input so same file can be re-selected
      e.target.value = '';
    },
    [handleFileSelected],
  );

  // Open file picker for "Take Photo" (simulated camera)
  const handleCameraCapture = () => {
    setValidationError(null);
    if (captureInputRef.current) {
      captureInputRef.current.accept = currentSlot.accept;
      captureInputRef.current.click();
    }
  };

  // Open file picker for "Upload from Gallery"
  const handleGalleryUpload = () => {
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.accept = currentSlot.accept;
      fileInputRef.current.click();
    }
  };

  // Retake current capture
  const handleRetake = () => {
    setValidationError(null);
    setUploadError(null);
    const prev = captures[currentSlot.type];
    if (prev) {
      URL.revokeObjectURL(prev.previewUrl);
    }
    setCaptures((c) => ({ ...c, [currentSlot.type]: null }));
  };

  // Advance to next slot
  const handleNext = () => {
    if (activeSlotIndex < CAPTURE_SLOTS.length - 1) {
      setActiveSlotIndex(activeSlotIndex + 1);
      setValidationError(null);
      setUploadError(null);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Submit media to API: initiate return → submit media refs → complete capture → navigate to grading
  const handleSubmit = async () => {
    setUploadError(null);
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      // Step 1: Initiate the return via POST /api/returns
      const initiateRes = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: state?.customerId ?? 'demo-customer-1',
          orderItemId: state?.orderItemId ?? 'demo-order-item-1',
          reason: state?.reason ?? 'defective',
          reasonDetails: state?.reasonDetails ?? null,
        }),
      });

      if (!initiateRes.ok) {
        const errData = await initiateRes.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to initiate return (${initiateRes.status})`);
      }

      const returnData = await initiateRes.json();
      const returnId = returnData.id;

      // Step 2: Build MediaReference objects and submit via POST /api/returns/:id/media
      const mediaRefs = CAPTURE_SLOTS.map((slot) => {
        const captured = captures[slot.type];
        const fileExt = slot.isVideo ? 'mp4' : 'jpeg';
        const format = slot.isVideo
          ? (captured?.file.type === 'video/quicktime' ? 'mov' : 'mp4')
          : (captured?.file.type === 'image/png' ? 'png' : 'jpeg');

        return {
          id: `${slot.type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: slot.type,
          storageKey: `uploads/${returnId}/${slot.type}_${Date.now()}.${fileExt}`,
          format,
          sizeBytes: captured?.file.size ?? 1024,
          capturedAt: new Date().toISOString(),
        };
      });

      const mediaRes = await fetch(`/api/returns/${returnId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media: mediaRefs }),
      });

      if (!mediaRes.ok) {
        const errData = await mediaRes.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to submit media (${mediaRes.status})`);
      }

      // Step 3: Complete capture to trigger grading via POST /api/returns/:id/complete-capture
      const completeRes = await fetch(`/api/returns/${returnId}/complete-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!completeRes.ok) {
        const errData = await completeRes.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to start grading (${completeRes.status})`);
      }

      // Step 4: Navigate to grading progress with returnId
      navigate('/returns/grading', {
        state: {
          ...state,
          returnId,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Retry a failed upload
  const handleRetryUpload = () => {
    setUploadError(null);
    // In production, this would retry the presigned URL upload
    // For demo, just clear the error state
  };

  return (
    <section className="media-capture" aria-label="Media capture for return">
      <h1>Capture Photos &amp; Video</h1>

      {/* Progress Steps */}
      <div className="media-progress" role="progressbar" aria-valuenow={activeSlotIndex + 1} aria-valuemin={1} aria-valuemax={4} aria-label={`Step ${activeSlotIndex + 1} of ${CAPTURE_SLOTS.length}`}>
        {CAPTURE_SLOTS.map((slot, idx) => (
          <div key={slot.type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              className={`media-progress-step ${
                captures[slot.type] ? 'completed' : idx === activeSlotIndex ? 'active' : ''
              }`}
              aria-label={`${slot.label}: ${captures[slot.type] ? 'captured' : idx === activeSlotIndex ? 'current' : 'pending'}`}
            >
              {captures[slot.type] ? '✓' : idx + 1}
            </div>
            {idx < CAPTURE_SLOTS.length - 1 && (
              <div className={`media-progress-connector ${captures[slot.type] ? 'completed' : ''}`} />
            )}
          </div>
        ))}
      </div>

      {/* Current Capture Slot */}
      <div className="capture-slot" aria-live="polite">
        <p className="capture-slot-label">{currentSlot.label} ({activeSlotIndex + 1}/{CAPTURE_SLOTS.length})</p>
        <p className="capture-slot-instruction">{currentSlot.instruction}</p>

        {/* Show framing guide or preview */}
        {!currentCapture ? (
          <div className={`framing-guide ${currentSlot.isVideo ? 'video' : ''}`} aria-hidden="true">
            <span className="framing-guide-icon">{currentSlot.isVideo ? '🎥' : '📷'}</span>
            <span className="framing-guide-hint">{currentSlot.framingHint}</span>
          </div>
        ) : (
          <div className={`capture-preview ${currentSlot.isVideo ? 'video' : ''}`}>
            {currentSlot.isVideo ? (
              <video src={currentCapture.previewUrl} controls aria-label="Captured video preview" />
            ) : (
              <img src={currentCapture.previewUrl} alt={`Captured ${currentSlot.label}`} />
            )}
            <span className="capture-preview-badge">Captured</span>
          </div>
        )}

        {/* Validation Error */}
        {validationError && (
          <div className="capture-error" role="alert">
            <span className="capture-error-icon" aria-hidden="true">⚠️</span>
            <span className="capture-error-text">{validationError}</span>
          </div>
        )}

        {/* Upload Error with Retry */}
        {uploadError && (
          <div className="capture-error" role="alert">
            <span className="capture-error-icon" aria-hidden="true">⚠️</span>
            <span className="capture-error-text">{uploadError}</span>
            <button className="capture-error-retry" onClick={handleRetryUpload} type="button">
              Retry
            </button>
          </div>
        )}

        {/* Capture / Retake Actions */}
        {!currentCapture ? (
          <div className="capture-actions">
            <button className="capture-btn capture-btn-camera" onClick={handleCameraCapture} type="button" aria-label={currentSlot.isVideo ? 'Record video' : 'Take photo'}>
              {currentSlot.isVideo ? '🎥' : '📷'} {currentSlot.isVideo ? 'Record Video' : 'Take Photo'}
            </button>
            <button className="capture-btn capture-btn-gallery" onClick={handleGalleryUpload} type="button" aria-label="Upload from gallery">
              📁 Upload from Gallery
            </button>
          </div>
        ) : (
          <div className="capture-actions">
            <button className="capture-btn capture-btn-retake" onClick={handleRetake} type="button" aria-label={`Retake ${currentSlot.label}`}>
              ↺ Retake
            </button>
          </div>
        )}
      </div>

      {/* Submit Error */}
      {submitError && (
        <div className="capture-error" role="alert" style={{ marginBottom: '1rem' }}>
          <span className="capture-error-icon" aria-hidden="true">⚠️</span>
          <span className="capture-error-text">{submitError}</span>
          <button className="capture-error-retry" onClick={handleSubmit} type="button">
            Retry
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="capture-nav">
        {!allCaptured ? (
          <button
            className="capture-nav-btn capture-nav-btn-next"
            onClick={handleNext}
            disabled={!currentCapture || activeSlotIndex >= CAPTURE_SLOTS.length - 1}
            type="button"
            aria-label="Proceed to next capture"
          >
            Next →
          </button>
        ) : (
          <button
            className="capture-nav-btn capture-nav-btn-submit"
            onClick={handleSubmit}
            disabled={isSubmitting}
            type="button"
            aria-label="Submit all media for grading"
          >
            {isSubmitting ? 'Submitting…' : 'Submit for Grading'}
          </button>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={captureInputRef}
        type="file"
        className="capture-file-input"
        onChange={onFileChange}
        aria-hidden="true"
        tabIndex={-1}
        capture="environment"
      />
      <input
        ref={fileInputRef}
        type="file"
        className="capture-file-input"
        onChange={onFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />
    </section>
  );
}
