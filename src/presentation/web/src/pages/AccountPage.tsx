import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AccountPage.css';

type Panel = 'overview' | 'profile' | 'address';

export function AccountPage() {
  const { user, isAuthenticated, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>('overview');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Profile form state
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');

  // Address form state
  const [street, setStreet]   = useState(user?.address?.street ?? '');
  const [city, setCity]       = useState(user?.address?.city ?? '');
  const [state_, setState_]   = useState(user?.address?.state ?? '');
  const [pincode, setPincode] = useState(user?.address?.pincode ?? '');

  if (!isAuthenticated) {
    return (
      <div className="account-unauth">
        <p>Please <Link to="/login">sign in</Link> to view your account.</p>
      </div>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setSaveErr('Name cannot be empty.'); return; }
    setIsSaving(true); setSaveMsg(null); setSaveErr(null);
    try {
      await updateUser({ name: name.trim(), phone: phone.trim() || undefined });
      setSaveMsg('Profile updated successfully!');
    } catch {
      setSaveErr('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!street.trim() || !city.trim() || !pincode.trim()) {
      setSaveErr('Street, City and Pincode are required.');
      return;
    }
    setIsSaving(true); setSaveMsg(null); setSaveErr(null);
    try {
      await updateUser({ address: { street: street.trim(), city: city.trim(), state: state_.trim(), pincode: pincode.trim() } });
      setSaveMsg('Address saved successfully!');
    } catch {
      setSaveErr('Failed to save address. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="account-page">
      {/* Sidebar */}
      <aside className="account-sidebar">
        <div className="account-sidebar__header">
          <div className="account-sidebar__avatar" aria-hidden="true">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="account-sidebar__name">{user?.name}</p>
            <p className="account-sidebar__email">{user?.email}</p>
          </div>
        </div>

        <nav className="account-sidebar__nav" aria-label="Account sections">
          <button type="button" className={`account-nav-item${panel === 'overview' ? ' active' : ''}`} onClick={() => { setPanel('overview'); setSaveMsg(null); setSaveErr(null); }}>
            📋 Account Overview
          </button>
          <button type="button" className={`account-nav-item${panel === 'profile' ? ' active' : ''}`} onClick={() => { setPanel('profile'); setSaveMsg(null); setSaveErr(null); }}>
            👤 Edit Profile
          </button>
          <button type="button" className={`account-nav-item${panel === 'address' ? ' active' : ''}`} onClick={() => { setPanel('address'); setSaveMsg(null); setSaveErr(null); }}>
            📍 Manage Address
          </button>
          <Link to="/orders" className="account-nav-item">📦 Your Orders</Link>
          <button type="button" className="account-nav-item account-nav-item--logout" onClick={handleLogout}>
            🚪 Sign Out
          </button>
        </nav>
      </aside>

      {/* Main content */}
      <main className="account-main">

        {/* Overview */}
        {panel === 'overview' && (
          <section aria-labelledby="overview-heading">
            <h1 id="overview-heading" className="account-section-title">Your Account</h1>
            <div className="account-cards">
              <button type="button" className="account-card" onClick={() => setPanel('profile')}>
                <span className="account-card__icon" aria-hidden="true">👤</span>
                <div>
                  <h2>Login &amp; Security</h2>
                  <p>Edit name, phone number</p>
                </div>
              </button>
              <button type="button" className="account-card" onClick={() => setPanel('address')}>
                <span className="account-card__icon" aria-hidden="true">📍</span>
                <div>
                  <h2>Your Addresses</h2>
                  <p>{user?.address ? `${user.address.street}, ${user.address.city}` : 'No address saved yet'}</p>
                </div>
              </button>
              <Link to="/orders" className="account-card">
                <span className="account-card__icon" aria-hidden="true">📦</span>
                <div>
                  <h2>Your Orders</h2>
                  <p>Track, return, or buy again</p>
                </div>
              </Link>
              <Link to="/orders" className="account-card">
                <span className="account-card__icon" aria-hidden="true">♻️</span>
                <div>
                  <h2>Returns &amp; Refunds</h2>
                  <p>Start a zero-touch return</p>
                </div>
              </Link>
            </div>
          </section>
        )}

        {/* Edit profile */}
        {panel === 'profile' && (
          <section aria-labelledby="profile-heading">
            <h1 id="profile-heading" className="account-section-title">Edit Profile</h1>
            <div className="account-form-card">
              <form onSubmit={handleSaveProfile} noValidate>
                <div className="account-field">
                  <label htmlFor="acc-name" className="account-label">Full name</label>
                  <input
                    id="acc-name"
                    type="text"
                    className="account-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    required
                    autoComplete="name"
                  />
                </div>
                <div className="account-field">
                  <label htmlFor="acc-email" className="account-label">Email</label>
                  <input
                    id="acc-email"
                    type="email"
                    className="account-input account-input--readonly"
                    value={user?.email ?? ''}
                    readOnly
                    aria-describedby="email-note"
                  />
                  <p id="email-note" className="account-field-note">Email cannot be changed in demo mode.</p>
                </div>
                <div className="account-field">
                  <label htmlFor="acc-phone" className="account-label">Mobile number (optional)</label>
                  <input
                    id="acc-phone"
                    type="tel"
                    className="account-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                  />
                </div>
                {saveMsg && <p className="account-save-success" role="status">{saveMsg}</p>}
                {saveErr && <p className="account-save-error" role="alert">{saveErr}</p>}
                <div className="account-form-actions">
                  <button type="submit" className="account-btn-save" disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button type="button" className="account-btn-cancel" onClick={() => setPanel('overview')}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {/* Manage address */}
        {panel === 'address' && (
          <section aria-labelledby="address-heading">
            <h1 id="address-heading" className="account-section-title">Manage Address</h1>
            <div className="account-form-card">
              <form onSubmit={handleSaveAddress} noValidate>
                <div className="account-field">
                  <label htmlFor="acc-street" className="account-label">Street address</label>
                  <input
                    id="acc-street"
                    type="text"
                    className="account-input"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="123, MG Road, Apartment 4B"
                    required
                    autoComplete="street-address"
                  />
                </div>
                <div className="account-field-row">
                  <div className="account-field">
                    <label htmlFor="acc-city" className="account-label">City</label>
                    <input
                      id="acc-city"
                      type="text"
                      className="account-input"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Bengaluru"
                      required
                      autoComplete="address-level2"
                    />
                  </div>
                  <div className="account-field">
                    <label htmlFor="acc-state" className="account-label">State</label>
                    <input
                      id="acc-state"
                      type="text"
                      className="account-input"
                      value={state_}
                      onChange={(e) => setState_(e.target.value)}
                      placeholder="Karnataka"
                      autoComplete="address-level1"
                    />
                  </div>
                </div>
                <div className="account-field" style={{ maxWidth: '200px' }}>
                  <label htmlFor="acc-pincode" className="account-label">PIN code</label>
                  <input
                    id="acc-pincode"
                    type="text"
                    className="account-input"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="560001"
                    required
                    inputMode="numeric"
                    autoComplete="postal-code"
                  />
                </div>
                {saveMsg && <p className="account-save-success" role="status">{saveMsg}</p>}
                {saveErr && <p className="account-save-error" role="alert">{saveErr}</p>}
                <div className="account-form-actions">
                  <button type="submit" className="account-btn-save" disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save Address'}
                  </button>
                  <button type="button" className="account-btn-cancel" onClick={() => setPanel('overview')}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
