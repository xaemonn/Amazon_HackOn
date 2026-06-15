import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

type Tab = 'login' | 'signup';

export function LoginPage() {
  const { login, signup, demoLogin, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/catalog';

  const [tab, setTab] = useState<Tab>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);

  // Signup fields
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [showSignupPw, setShowSignupPw] = useState(false);

  if (isAuthenticated) {
    navigate(from, { replace: true });
    return null;
  }

  const switchTab = (t: Tab) => {
    setTab(t);
    setError(null);
    setSuccess(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginEmail.trim() || !loginPassword) {
      setError('Please enter your email and password.');
      return;
    }
    setIsLoading(true);
    try {
      await login(loginEmail.trim(), loginPassword);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemo = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await demoLogin();
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!signupName.trim()) { setError('Please enter your full name.'); return; }
    if (!signupEmail.trim()) { setError('Please enter your email.'); return; }
    if (signupPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (signupPassword !== signupConfirm) { setError('Passwords do not match.'); return; }
    setIsLoading(true);
    try {
      await signup(signupName.trim(), signupEmail.trim(), signupPassword);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-brand">
          <span className="login-logo" aria-hidden="true">♻️</span>
          <span className="login-subtitle">Second Life Commerce</span>
        </div>

        {/* Tabs */}
        <div className="login-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'login'}
            className={`login-tab ${tab === 'login' ? 'login-tab--active' : ''}`}
            onClick={() => switchTab('login')}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'signup'}
            className={`login-tab ${tab === 'signup' ? 'login-tab--active' : ''}`}
            onClick={() => switchTab('signup')}
          >
            Create Account
          </button>
        </div>

        {/* One-click demo sign-in for judges (includes the product test harness) */}
        <button
          type="button"
          className="login-btn login-btn--demo"
          onClick={handleDemo}
          disabled={isLoading}
        >
          🧑‍⚖️ Judges — sign in here to test the app
        </button>
        <p className="login-demo-hint">
          One-click demo account. You'll be able to add your own product (with photos)
          and test the full return &amp; AI-grading flow.
        </p>
        <div className="login-divider"><span>or use your account</span></div>

        {/* Error / Success */}
        {error && <p className="login-error" role="alert">{error}</p>}
        {success && <p className="login-success" role="status">{success}</p>}

        {/* ── Login Form ── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="login-form" noValidate>
            <div className="login-field">
              <label htmlFor="login-email" className="login-label">Email address</label>
              <input
                id="login-email"
                type="email"
                className="login-input"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password" className="login-label">Password</label>
              <div className="login-input-wrap">
                <input
                  id="login-password"
                  type={showLoginPw ? 'text' : 'password'}
                  className="login-input"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-pw-toggle"
                  onClick={() => setShowLoginPw((v) => !v)}
                  aria-label={showLoginPw ? 'Hide password' : 'Show password'}
                >
                  {showLoginPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-btn login-btn--primary"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in…' : 'Sign In'}
            </button>

            <p className="login-switch-hint">
              New here?{' '}
              <button type="button" className="login-link" onClick={() => switchTab('signup')}>
                Create an account
              </button>
            </p>
          </form>
        )}

        {/* ── Signup Form ── */}
        {tab === 'signup' && (
          <form onSubmit={handleSignup} className="login-form" noValidate>
            <div className="login-field">
              <label htmlFor="signup-name" className="login-label">Full name</label>
              <input
                id="signup-name"
                type="text"
                className="login-input"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                placeholder="Priya Sharma"
                autoComplete="name"
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="signup-email" className="login-label">Email address</label>
              <input
                id="signup-email"
                type="email"
                className="login-input"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="signup-password" className="login-label">
                Password <span className="login-label-hint">(min. 6 characters)</span>
              </label>
              <div className="login-input-wrap">
                <input
                  id="signup-password"
                  type={showSignupPw ? 'text' : 'password'}
                  className="login-input"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="Create a password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="login-pw-toggle"
                  onClick={() => setShowSignupPw((v) => !v)}
                  aria-label={showSignupPw ? 'Hide password' : 'Show password'}
                >
                  {showSignupPw ? '🙈' : '👁️'}
                </button>
              </div>
              {signupPassword.length > 0 && (
                <div className="login-pw-strength">
                  <div className={`login-pw-bar ${signupPassword.length >= 8 ? 'strong' : signupPassword.length >= 6 ? 'medium' : 'weak'}`} />
                  <span>{signupPassword.length >= 8 ? 'Strong' : signupPassword.length >= 6 ? 'Medium' : 'Weak'}</span>
                </div>
              )}
            </div>

            <div className="login-field">
              <label htmlFor="signup-confirm" className="login-label">Confirm password</label>
              <input
                id="signup-confirm"
                type={showSignupPw ? 'text' : 'password'}
                className={`login-input ${signupConfirm && signupPassword !== signupConfirm ? 'login-input--error' : ''}`}
                value={signupConfirm}
                onChange={(e) => setSignupConfirm(e.target.value)}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                required
              />
              {signupConfirm && signupPassword !== signupConfirm && (
                <span className="login-field-error">Passwords do not match</span>
              )}
            </div>

            <button
              type="submit"
              className="login-btn login-btn--primary"
              disabled={isLoading || (!!signupConfirm && signupPassword !== signupConfirm)}
            >
              {isLoading ? 'Creating account…' : 'Create Account'}
            </button>

            <p className="login-terms">
              By creating an account, you agree to our{' '}
              <span className="login-link">Conditions of Use</span> and{' '}
              <span className="login-link">Privacy Notice</span>.
            </p>

            <p className="login-switch-hint">
              Already have an account?{' '}
              <button type="button" className="login-link" onClick={() => switchTab('login')}>
                Sign in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
