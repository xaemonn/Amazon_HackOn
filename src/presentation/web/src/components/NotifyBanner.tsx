import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './NotifyBanner.css';

interface GradeResult {
  returnId: string;
  grade: string | null;
  refundAmount?: number;
  currency?: string;
}

export function NotifyBanner() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<GradeResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    const raw = localStorage.getItem('pendingGradeNotify');
    if (!raw) return;
    const ids: string[] = JSON.parse(raw);
    if (ids.length === 0) return;

    for (const returnId of ids) {
      try {
        const res = await fetch(`/api/returns/${returnId}/progress`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.complete && data.result) {
          const grade = data.result.conditionAssessment?.grade ?? null;
          const refund = data.result.dispositionDecision?.refundEstimate;
          // Remove from pending
          const remaining = ids.filter((id) => id !== returnId);
          localStorage.setItem('pendingGradeNotify', JSON.stringify(remaining));
          setReady({
            returnId,
            grade,
            refundAmount: refund?.amount,
            currency: refund?.currency,
          });
          setDismissed(false);
          return;
        }
      } catch {
        // silently ignore network errors
      }
    }
  }, []);

  // Poll every 3 seconds while there are pending notifications
  useEffect(() => {
    const hasPending = () => {
      const raw = localStorage.getItem('pendingGradeNotify');
      if (!raw) return false;
      try { return (JSON.parse(raw) as string[]).length > 0; } catch { return false; }
    };

    if (!hasPending()) return;

    check(); // immediate first check
    pollRef.current = setInterval(() => {
      if (!hasPending()) {
        clearInterval(pollRef.current!);
        return;
      }
      check();
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [check]);

  if (!ready || dismissed) return null;

  const sym = ready.currency === 'INR' ? '₹' : '$';
  const gradeLabel: Record<string, string> = { A: 'Like New', B: 'Good', C: 'Fair', D: 'Poor' };

  return (
    <div className="notify-banner" role="alert" aria-live="assertive">
      <div className="notify-banner__icon">🔔</div>
      <div className="notify-banner__body">
        <p className="notify-banner__title">Your item has been verified!</p>
        <p className="notify-banner__sub">
          {ready.grade
            ? <>Grade <strong>{ready.grade}</strong> ({gradeLabel[ready.grade] ?? ready.grade})
                {ready.refundAmount != null && (
                  <> · Refund estimate: <strong>{sym}{ready.refundAmount.toLocaleString('en-IN')}</strong></>
                )}
              </>
            : 'Grading complete — tap to see your result.'
          }
        </p>
      </div>
      <div className="notify-banner__actions">
        <button
          className="notify-banner__btn notify-banner__btn--view"
          onClick={() => {
            setDismissed(true);
            navigate('/orders');
          }}
        >
          View Result
        </button>
        <button
          className="notify-banner__btn notify-banner__btn--dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss notification"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
