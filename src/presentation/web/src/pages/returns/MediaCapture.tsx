import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './ReturnPage.css';
import './MediaCapture.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotType = 'photo_front' | 'photo_back' | 'photo_closeup' | 'video';

interface CaptureSlot {
  type: SlotType;
  label: string;
  instruction: string;
  framingHint: string;
  accept: string;
  maxSizeMB: number;
  isVideo: boolean;
  angleHint: string;
}

interface CapturedMedia {
  file: File;
  previewUrl: string;
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'error';
  errorMessage?: string;
  qualityWarning?: string;
}

// ─── Slot config ──────────────────────────────────────────────────────────────

const CAPTURE_SLOTS: CaptureSlot[] = [
  {
    type: 'photo_front',
    label: 'Front View',
    instruction: 'Take a clear photo of the front of your item',
    framingHint: 'Position item centered, filling most of the frame',
    accept: 'image/jpeg,image/png',
    maxSizeMB: 10,
    isVideo: false,
    angleHint: 'Front face of the item, flat and centered',
  },
  {
    type: 'photo_back',
    label: 'Back View',
    instruction: 'Flip the item over and capture the back',
    framingHint: 'Flip the item, keep it centered. Must be a DIFFERENT angle from front.',
    accept: 'image/jpeg,image/png',
    maxSizeMB: 10,
    isVideo: false,
    angleHint: 'Back face — rotate 180° from your front photo',
  },
  {
    type: 'photo_closeup',
    label: 'Close-up',
    instruction: 'Take a close-up of any damage, wear, or the product label',
    framingHint: 'Move close to the label, damage area, or serial number',
    accept: 'image/jpeg,image/png',
    maxSizeMB: 10,
    isVideo: false,
    angleHint: 'Macro shot — get within 10–20 cm of the surface',
  },
  {
    type: 'video',
    label: 'Short Video',
    instruction: 'Record a 5–30 second video rotating the item slowly',
    framingHint: 'Slowly rotate the item to show all sides',
    accept: 'video/mp4,video/quicktime',
    maxSizeMB: 50,
    isVideo: true,
    angleHint: 'Hold camera steady and rotate the item 360°',
  },
];

// ─── Image quality analysis (canvas-based) ────────────────────────────────────

interface QualityResult {
  passed: boolean;
  warning: string | null;
}

function analyzeImageQuality(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): QualityResult {
  if (width === 0 || height === 0) return { passed: true, warning: null };

  const data = ctx.getImageData(0, 0, width, height).data;
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  // Sample every 4th pixel for performance
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += gray;
    sumSq += gray * gray;
    count++;
  }

  if (count === 0) return { passed: true, warning: null };

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  if (mean < 25) return { passed: false, warning: 'Image is too dark — move to a brighter area or turn on more lights.' };
  if (mean > 235) return { passed: false, warning: 'Image is overexposed — avoid direct bright light or flash.' };
  if (variance < 150) return { passed: false, warning: 'Image appears blurry — hold the camera steady and try again.' };

  return { passed: true, warning: null };
}

// ─── File validation ──────────────────────────────────────────────────────────

function validateFile(file: File, slot: CaptureSlot): string | null {
  if (file.size > slot.maxSizeMB * 1024 * 1024) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${slot.maxSizeMB} MB.`;
  }
  const allowed = slot.accept.split(',').map((t) => t.trim());
  if (!allowed.includes(file.type) && !(file.type === '' && /\.(mov|MOV)$/.test(file.name))) {
    return slot.isVideo ? 'Use MP4 or MOV video.' : 'Use JPEG or PNG image.';
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Webcam state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasCameraSupport, setHasCameraSupport] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const currentSlot = CAPTURE_SLOTS[activeSlotIndex];
  const currentCapture = captures[currentSlot.type];
  const allCaptured = CAPTURE_SLOTS.every((s) => captures[s.type] !== null);

  // Check camera support on mount
  useEffect(() => {
    setHasCameraSupport(!!navigator.mediaDevices?.getUserMedia);
    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach stream to video element when camera activates
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);

  // Stop camera when navigating away or slot changes
  useEffect(() => {
    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlotIndex]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // ── Open webcam ──────────────────────────────────────────────────────────────

  const handleOpenCamera = async () => {
    if (currentSlot.isVideo) {
      // For video, use the file input with capture
      if (captureInputRef.current) {
        captureInputRef.current.accept = 'video/mp4,video/quicktime';
        captureInputRef.current.capture = 'environment';
        captureInputRef.current.click();
      }
      return;
    }

    setCameraError(null);
    setValidationError(null);

    try {
      // Try back camera first (mobile), fall back to any camera (laptop)
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setCameraError('Camera permission denied. Please allow camera access and try again, or use "Upload Photo" instead.');
      } else {
        setCameraError('Could not access camera. Use "Upload Photo" to select an image.');
      }
      // Fallback to file picker
      if (captureInputRef.current) {
        captureInputRef.current.accept = currentSlot.accept;
        captureInputRef.current.capture = 'environment';
        captureInputRef.current.click();
      }
    }
  };

  // ── Capture photo from live stream ──────────────────────────────────────────

  const handleCaptureFromCamera = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    // Quality check
    const quality = analyzeImageQuality(ctx, w, h);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `${currentSlot.type}_${Date.now()}.jpeg`, { type: 'image/jpeg' });
        stopCamera();

        const previewUrl = URL.createObjectURL(file);
        setCaptures((prev) => ({
          ...prev,
          [currentSlot.type]: {
            file,
            previewUrl,
            uploadStatus: 'pending' as const,
            qualityWarning: quality.warning ?? undefined,
          },
        }));
        setValidationError(null);
      },
      'image/jpeg',
      0.92,
    );
  }, [currentSlot]);

  // ── Handle file upload ───────────────────────────────────────────────────────

  const handleFileSelected = useCallback(
    (file: File) => {
      setValidationError(null);
      setUploadError(null);

      const error = validateFile(file, currentSlot);
      if (error) { setValidationError(error); return; }

      if (!currentSlot.isVideo) {
        // Run quality check on uploaded images via canvas
        const img = new Image();
        const objUrl = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          let qualityWarning: string | undefined;
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const quality = analyzeImageQuality(ctx, canvas.width, canvas.height);
            qualityWarning = quality.warning ?? undefined;
          }
          setCaptures((prev) => ({
            ...prev,
            [currentSlot.type]: { file, previewUrl: objUrl, uploadStatus: 'pending', qualityWarning },
          }));
        };
        img.src = objUrl;
      } else {
        const previewUrl = URL.createObjectURL(file);
        setCaptures((prev) => ({
          ...prev,
          [currentSlot.type]: { file, previewUrl, uploadStatus: 'pending' },
        }));
      }
    },
    [currentSlot],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelected(file);
      e.target.value = '';
    },
    [handleFileSelected],
  );

  // ── Retake ───────────────────────────────────────────────────────────────────

  const handleRetake = () => {
    setValidationError(null);
    setUploadError(null);
    const prev = captures[currentSlot.type];
    if (prev) URL.revokeObjectURL(prev.previewUrl);
    setCaptures((c) => ({ ...c, [currentSlot.type]: null }));
    stopCamera();
  };

  // ── Navigation ───────────────────────────────────────────────────────────────

  const handleNext = () => {
    if (activeSlotIndex < CAPTURE_SLOTS.length - 1) {
      setActiveSlotIndex(activeSlotIndex + 1);
      setValidationError(null);
      setUploadError(null);
      stopCamera();
    }
  };

  const handleGalleryUpload = () => {
    setValidationError(null);
    stopCamera();
    if (fileInputRef.current) {
      fileInputRef.current.accept = currentSlot.accept;
      fileInputRef.current.click();
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setUploadError(null);
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const initiateRes = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: state?.customerId ?? 'customer-001',
          orderItemId: state?.orderItemId ?? 'order-item-001',
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
        const e = await mediaRes.json().catch(() => ({}));
        throw new Error(e.error || `Failed to submit media (${mediaRes.status})`);
      }

      const completeRes = await fetch(`/api/returns/${returnId}/complete-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!completeRes.ok) {
        const e = await completeRes.json().catch(() => ({}));
        throw new Error(e.error || `Failed to start grading (${completeRes.status})`);
      }

      navigate('/returns/grading', { state: { ...state, returnId } });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <section className="media-capture" aria-label="Capture photos for return">
      <h1>Capture Photos &amp; Video</h1>
      <p className="media-capture__subtitle">
        Our AI analyzes your photos immediately — results in under 5 minutes.
      </p>

      {/* Progress stepper */}
      <div className="media-progress" role="progressbar" aria-valuenow={activeSlotIndex + 1} aria-valuemin={1} aria-valuemax={4}>
        {CAPTURE_SLOTS.map((slot, idx) => (
          <div key={slot.type} className="media-progress__step-wrapper">
            <button
              type="button"
              className={`media-progress-step ${captures[slot.type] ? 'completed' : idx === activeSlotIndex ? 'active' : ''}`}
              onClick={() => { if (captures[slot.type] || idx <= activeSlotIndex) { stopCamera(); setActiveSlotIndex(idx); } }}
              aria-label={`${slot.label}: ${captures[slot.type] ? 'done' : idx === activeSlotIndex ? 'current' : 'pending'}`}
              aria-current={idx === activeSlotIndex ? 'step' : undefined}
            >
              {captures[slot.type] ? '✓' : idx + 1}
            </button>
            <span className="media-progress__step-label">{slot.label}</span>
            {idx < CAPTURE_SLOTS.length - 1 && (
              <div className={`media-progress-connector ${captures[slot.type] ? 'completed' : ''}`} />
            )}
          </div>
        ))}
      </div>

      {/* Current slot */}
      <div className="capture-slot" aria-live="polite">
        <div className="capture-slot__header">
          <span className="capture-slot-label">{currentSlot.label} ({activeSlotIndex + 1}/{CAPTURE_SLOTS.length})</span>
        </div>
        <p className="capture-slot-instruction">{currentSlot.instruction}</p>
        <div className="capture-slot__angle-tip">
          📐 <strong>Angle tip:</strong> {currentSlot.angleHint}
        </div>

        {/* Live webcam preview */}
        {cameraActive && !currentCapture && (
          <div className="camera-live">
            <video ref={videoRef} autoPlay playsInline muted className="camera-live__video" aria-label="Live camera preview" />
            <div className="camera-live__overlay">
              <div className="camera-live__frame" aria-hidden="true" />
            </div>
            <div className="camera-live__controls">
              <button type="button" className="camera-shutter-btn" onClick={handleCaptureFromCamera} aria-label="Take photo">
                <span className="camera-shutter-btn__inner" />
              </button>
              <button type="button" className="camera-cancel-btn" onClick={() => stopCamera()} aria-label="Cancel camera">
                ✕ Cancel
              </button>
            </div>
          </div>
        )}

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true" />

        {/* Framing guide (when no camera active and no capture) */}
        {!cameraActive && !currentCapture && (
          <div className={`framing-guide ${currentSlot.isVideo ? 'video' : ''}`} aria-hidden="true">
            <span className="framing-guide-icon">{currentSlot.isVideo ? '🎥' : '📷'}</span>
            <span className="framing-guide-hint">{currentSlot.framingHint}</span>
          </div>
        )}

        {/* Preview */}
        {currentCapture && !cameraActive && (
          <div className={`capture-preview ${currentSlot.isVideo ? 'video' : ''}`}>
            {currentSlot.isVideo ? (
              <video src={currentCapture.previewUrl} controls aria-label="Captured video preview" />
            ) : (
              <img src={currentCapture.previewUrl} alt={`Captured ${currentSlot.label}`} />
            )}
            <span className="capture-preview-badge">✓ Captured</span>
          </div>
        )}

        {/* Quality warning — shown after capture */}
        {currentCapture?.qualityWarning && (
          <div className="capture-quality-warning" role="alert">
            <span className="capture-quality-warning__icon" aria-hidden="true">⚠️</span>
            <div>
              <strong>Image quality issue detected</strong>
              <p>{currentCapture.qualityWarning}</p>
              <button type="button" className="capture-quality-warning__retake" onClick={handleRetake}>
                Retake Photo
              </button>
            </div>
          </div>
        )}

        {/* Camera error */}
        {cameraError && (
          <div className="capture-error" role="alert">
            <span className="capture-error-icon" aria-hidden="true">📷</span>
            <span className="capture-error-text">{cameraError}</span>
          </div>
        )}

        {/* Validation error */}
        {validationError && (
          <div className="capture-error" role="alert">
            <span className="capture-error-icon" aria-hidden="true">⚠️</span>
            <span className="capture-error-text">{validationError}</span>
          </div>
        )}

        {/* Upload error */}
        {uploadError && (
          <div className="capture-error" role="alert">
            <span className="capture-error-icon" aria-hidden="true">⚠️</span>
            <span className="capture-error-text">{uploadError}</span>
          </div>
        )}

        {/* Action buttons */}
        {!cameraActive && !currentCapture && (
          <div className="capture-actions">
            {hasCameraSupport && (
              <button type="button" className="capture-btn capture-btn-camera" onClick={handleOpenCamera} aria-label={currentSlot.isVideo ? 'Open camera to record' : 'Open camera to take photo'}>
                <span aria-hidden="true">{currentSlot.isVideo ? '🎥' : '📷'}</span>
                {currentSlot.isVideo ? 'Record Video' : 'Use Camera'}
              </button>
            )}
            <button type="button" className="capture-btn capture-btn-gallery" onClick={handleGalleryUpload} aria-label="Upload from gallery">
              <span aria-hidden="true">📁</span> Upload Photo
            </button>
          </div>
        )}

        {!cameraActive && currentCapture && (
          <div className="capture-actions">
            <button type="button" className="capture-btn capture-btn-retake" onClick={handleRetake} aria-label={`Retake ${currentSlot.label}`}>
              ↺ Retake
            </button>
          </div>
        )}
      </div>

      {/* Submit error */}
      {submitError && (
        <div className="capture-error" role="alert" style={{ marginBottom: '1rem' }}>
          <span className="capture-error-icon" aria-hidden="true">⚠️</span>
          <span className="capture-error-text">{submitError}</span>
          <button type="button" className="capture-error-retry" onClick={handleSubmit}>Retry</button>
        </div>
      )}

      {/* Navigation */}
      <div className="capture-nav">
        {activeSlotIndex > 0 && (
          <button type="button" className="capture-nav-btn capture-nav-btn-back" onClick={() => { stopCamera(); setActiveSlotIndex(activeSlotIndex - 1); }}>
            ← Back
          </button>
        )}

        {!allCaptured && currentCapture && activeSlotIndex < CAPTURE_SLOTS.length - 1 && (
          <button type="button" className="capture-nav-btn capture-nav-btn-next" onClick={handleNext}>
            Next →
          </button>
        )}

        {allCaptured && (
          <button type="button" className="capture-nav-btn capture-nav-btn-submit" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting for AI grading…' : '🤖 Submit for AI Grading'}
          </button>
        )}
      </div>

      {/* Photo tips */}
      <div className="capture-tips">
        <h3>📸 Tips for better results</h3>
        <ul>
          <li>Use natural light or a well-lit room</li>
          <li>Keep the camera steady when shooting</li>
          <li>Make sure each photo shows a <strong>different angle</strong></li>
          <li>Include any damage, scratches, or defects in the close-up</li>
        </ul>
      </div>

      {/* Hidden file inputs */}
      <input ref={captureInputRef} type="file" className="capture-file-input" onChange={onFileChange} aria-hidden="true" tabIndex={-1} capture="environment" />
      <input ref={fileInputRef}    type="file" className="capture-file-input" onChange={onFileChange} aria-hidden="true" tabIndex={-1} />
    </section>
  );
}
