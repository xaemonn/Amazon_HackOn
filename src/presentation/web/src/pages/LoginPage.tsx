import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/catalog';

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    navigate(from, { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(email.trim());
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemo = async () => {
    setEmail('priya@example.com');
    setError(null);
    setIsLoading(true);
    try {
      await login('priya@example.com');
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo" aria-hidden="true">♻️</div>
        <h1 className="login-title">Sign in</h1>
        <p className="login-subtitle">Second Life Commerce</p>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="login-field">
            <label htmlFor="email-input" className="login-label">Email address</label>
            <input
              id="email-input"
              type="email"
              className="login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>

          {error && (
            <p id="login-error" className="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="login-btn login-btn--primary"
            disabled={isLoading || !email.trim()}
          >
            {isLoading ? 'Signing in…' : 'Continue'}
          </button>
        </form>

        <div className="login-divider" aria-hidden="true"><span>or</span></div>

        <button
          type="button"
          className="login-btn login-btn--demo"
          onClick={handleDemo}
          disabled={isLoading}
        >
          ✨ Use demo account
        </button>

        <p className="login-hint">
          Demo: <strong>priya@example.com</strong> — any password works
        </p>
      </div>
    </div>
  );
}
