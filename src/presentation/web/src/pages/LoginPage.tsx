import { useState, useEffect, useCallback, FormEvent, KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './LoginPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

type PageStep = 'contact' | 'otp';

interface ApiError {
  message?: string;
  retryAfterMs?: number;
}

/**
 * LoginPage handles both Login and Sign-Up flows.
 * The backend handles new-vs-existing transparently (Req 1.5).
 * Validates: Requirements 1.1, 1.3, 1.4, 2.1, 2.2, 2.5, 2.6, 15.1, 15.3, 15.4
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  const returnTo = searchParams.get('returnTo') || '/orders';

  const [step, setStep] = useState<PageStep>('contact');
  const [contact, setContact] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Countdown timer for lockout (Req 2.6)
  useEffect(() => {
    if (lockedUntil === null) return;

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        setLockedUntil(null);
        setError(null);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const handleSendOtp = useCallback(
    async (e?: FormEvent) => {
      if (e) e.preventDefault();
      setError(null);
      setIsExpired(false);

      const trimmed = contact.trim();
      if (!trimmed) {
        setError('Please enter your email or phone number.');
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/identity/otp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact: trimmed }),
        });

        if (!res.ok) {
          const body: ApiError = await res.json().catch(() => ({}));
          setError(body.message || 'Failed to send OTP. Please check your input.');
          return;
        }

        setStep('otp');
        setOtpCode('');
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [contact]
  );

  const handleVerifyOtp = useCallback(
    async (e?: FormEvent) => {
      if (e) e.preventDefault();
      setError(null);
      setIsExpired(false);

      const code = otpCode.trim();
      if (code.length !== 6 || !/^\d{6}$/.test(code)) {
        setError('Please enter a valid 6-digit code.');
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/identity/otp/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact: contact.trim(), code }),
        });

        if (res.ok) {
          const { token } = await res.json();
          login(token);
          navigate(returnTo, { replace: true });
          return;
        }

        const body: ApiError = await res.json().catch(() => ({}));

        if (res.status === 429 && body.retryAfterMs) {
          // Locked state (Req 2.6)
          setLockedUntil(Date.now() + body.retryAfterMs);
          setError(`Too many attempts. Try again in ${Math.ceil(body.retryAfterMs / 1000)}s.`);
          return;
        }

        if (
          res.status === 401 &&
          body.message?.toLowerCase().includes('expired')
        ) {
          // Expired OTP (Req 1.4)
          setIsExpired(true);
          setError('Code expired. Please request a new one.');
          return;
        }

        // Invalid OTP (Req 1.3)
        setError(body.message || 'Invalid code. Please try again.');
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [otpCode, contact, login, navigate, returnTo]
  );

  const handleResendOtp = useCallback(async () => {
    setIsExpired(false);
    setOtpCode('');
    await handleSendOtp();
  }, [handleSendOtp]);

  const handleBackToContact = useCallback(() => {
    setStep('contact');
    setError(null);
    setIsExpired(false);
    setOtpCode('');
    setLockedUntil(null);
  }, []);

  const handleOtpKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleVerifyOtp();
    }
  };

  const isLocked = lockedUntil !== null && countdown > 0;

  return (
    <div className="login-page">
      <div className="login-container">
        <h1 className="login-title">
          {step === 'contact' ? 'Sign in or create account' : 'Enter verification code'}
        </h1>

        {step === 'contact' && (
          <form onSubmit={handleSendOtp} className="login-form" noValidate>
            <label htmlFor="contact-input" className="login-label">
              Email or mobile phone number
            </label>
            <input
              id="contact-input"
              type="text"
              className="login-input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="name@example.com or +91XXXXXXXXXX"
              autoComplete="email"
              autoFocus
              disabled={loading}
              aria-describedby={error ? 'login-error' : undefined}
            />

            {error && (
              <p id="login-error" className="login-error" role="alert" aria-live="polite">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={loading || !contact.trim()}
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <div className="login-form">
            <p className="login-subtitle">
              We sent a code to <strong>{contact.trim()}</strong>
            </p>

            <label htmlFor="otp-input" className="login-label">
              6-digit code
            </label>
            <input
              id="otp-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              className="login-input otp-input"
              value={otpCode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setOtpCode(val);
              }}
              onKeyDown={handleOtpKeyDown}
              placeholder="000000"
              autoFocus
              disabled={loading || isLocked}
              aria-describedby={error ? 'otp-error' : undefined}
            />

            {error && (
              <p id="otp-error" className="login-error" role="alert" aria-live="polite">
                {error}
                {isLocked && (
                  <span className="countdown-badge">
                    {' '}Try again in {countdown}s
                  </span>
                )}
              </p>
            )}

            {isExpired && (
              <button
                type="button"
                className="login-link-button"
                onClick={handleResendOtp}
                disabled={loading}
              >
                Resend code
              </button>
            )}

            <button
              type="button"
              className="login-button"
              onClick={() => handleVerifyOtp()}
              disabled={loading || otpCode.length !== 6 || isLocked}
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>

            <button
              type="button"
              className="login-back-button"
              onClick={handleBackToContact}
              disabled={loading}
            >
              ← Change email / phone
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * SignUpPage — same component as LoginPage.
 * Backend handles new-vs-existing transparently (Req 1.5).
 */
export function SignUpPage() {
  return <LoginPage />;
}
