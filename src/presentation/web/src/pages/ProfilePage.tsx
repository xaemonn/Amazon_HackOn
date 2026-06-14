import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { SkeletonLoader } from '../components/SkeletonLoader';
import './ProfilePage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/** Minimum display time for skeleton loader (Req 3.1) */
const MIN_SKELETON_MS = 2000;

interface ProfileData {
  id: string;
  name: string;
  email: string;
}

/**
 * Masks an email: first 2 chars + ***@domain.com
 * e.g. "priya@example.com" → "pr***@example.com"
 */
function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;
  const visible = localPart.slice(0, 2);
  return `${visible}***@${domain}`;
}

/**
 * Masks a phone number: +91 ****XXXX (last 4 digits visible)
 * e.g. "+919876543210" → "+91 ****3210"
 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  const lastFour = digits.slice(-4);
  return `+91 ****${lastFour}`;
}

/**
 * Determines if a contact is a phone number or email and masks accordingly.
 */
function maskContact(contact: string): string {
  if (!contact) return '';
  // If it looks like a phone number (starts with + or contains mostly digits)
  const digits = contact.replace(/\D/g, '');
  if (contact.startsWith('+') || (digits.length >= 10 && !contact.includes('@'))) {
    return maskPhone(contact);
  }
  return maskEmail(contact);
}

/**
 * ProfilePage — displays customer name and masked contact with inline name editing.
 * Validates: Requirements 3.1, 3.2, 3.3, 15.1, 15.3
 */
export function ProfilePage() {
  const { sessionToken } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    const startTime = Date.now();

    try {
      const res = await fetch(`${API_BASE_URL}/api/account/profile`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load profile');
      }

      const data: ProfileData = await res.json();

      // Enforce minimum skeleton display time (Req 3.1 — 2s)
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_SKELETON_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_SKELETON_MS - elapsed));
      }

      setProfile(data);
    } catch {
      // Enforce minimum skeleton display time even on error
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_SKELETON_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_SKELETON_MS - elapsed));
      }
      setFetchError('Unable to load your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Clear success message after a timeout
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 3000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  const handleStartEdit = useCallback(() => {
    if (!profile) return;
    setEditName(profile.name);
    setEditError(null);
    setSuccessMsg(null);
    setEditing(true);
  }, [profile]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setEditName('');
    setEditError(null);
  }, []);

  const handleSave = useCallback(
    async (e?: FormEvent) => {
      if (e) e.preventDefault();

      const trimmed = editName.trim();

      // Inline validation: empty/whitespace name (Req 3.3)
      if (!trimmed) {
        setEditError('Name is required. Please enter your name.');
        return;
      }

      if (trimmed.length > 100) {
        setEditError('Name must be 100 characters or fewer.');
        return;
      }

      setEditError(null);
      setSaving(true);

      // Optimistic update (Req 3.2 — display immediately)
      const previousProfile = profile;
      setProfile((prev) => (prev ? { ...prev, name: trimmed } : prev));
      setEditing(false);

      try {
        const res = await fetch(`${API_BASE_URL}/api/account/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ name: trimmed }),
        });

        if (!res.ok) {
          // Revert optimistic update
          setProfile(previousProfile);
          setEditing(true);
          setEditName(trimmed);

          const body = await res.json().catch(() => ({}));
          setEditError(body.message || 'Failed to update name. Please try again.');
          return;
        }

        const updated: ProfileData = await res.json();
        setProfile(updated);
        setSuccessMsg('Name updated successfully.');
      } catch {
        // Revert on network error
        setProfile(previousProfile);
        setEditing(true);
        setEditName(trimmed);
        setEditError('Network error. Please try again.');
      } finally {
        setSaving(false);
      }
    },
    [editName, profile, sessionToken]
  );

  // --- Render loading skeleton ---
  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-container">
          <h1 className="profile-title">My Profile</h1>
          <div className="profile-skeleton" aria-label="Loading profile">
            <div className="profile-skeleton-section">
              <SkeletonLoader height="0.75rem" width="4rem" />
              <SkeletonLoader height="1.5rem" width="60%" />
            </div>
            <div className="profile-skeleton-section">
              <SkeletonLoader height="0.75rem" width="4rem" />
              <SkeletonLoader height="1.25rem" width="50%" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Render error state ---
  if (fetchError) {
    return (
      <div className="profile-page">
        <div className="profile-container">
          <h1 className="profile-title">My Profile</h1>
          <div className="profile-error">
            <p className="profile-error-msg" role="alert">
              {fetchError}
            </p>
            <button
              className="profile-retry-btn"
              onClick={fetchProfile}
              type="button"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render profile ---
  return (
    <div className="profile-page">
      <div className="profile-container">
        <h1 className="profile-title">My Profile</h1>

        {/* Name section with inline editing */}
        <div className="profile-section">
          <p className="profile-label">Name</p>

          {!editing ? (
            <div className="profile-name-display">
              <p className="profile-name-text">{profile?.name}</p>
              <button
                className="profile-edit-btn"
                onClick={handleStartEdit}
                type="button"
                aria-label="Edit name"
              >
                Edit
              </button>
            </div>
          ) : (
            <form className="profile-edit-form" onSubmit={handleSave} noValidate>
              <div className="profile-edit-input-row">
                <input
                  ref={inputRef}
                  type="text"
                  className={`profile-edit-input ${editError ? 'input-error' : ''}`}
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    if (editError) setEditError(null);
                  }}
                  maxLength={100}
                  disabled={saving}
                  aria-label="Full name"
                  aria-describedby={editError ? 'name-edit-error' : undefined}
                  aria-invalid={editError ? 'true' : undefined}
                />
                <button
                  type="submit"
                  className="profile-save-btn"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="profile-cancel-btn"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>

              {editError && (
                <p
                  id="name-edit-error"
                  className="profile-inline-error"
                  role="alert"
                  aria-live="polite"
                >
                  {editError}
                </p>
              )}
            </form>
          )}

          {successMsg && (
            <p className="profile-success-msg" role="status" aria-live="polite">
              {successMsg}
            </p>
          )}
        </div>

        {/* Contact section — display-only, masked */}
        <div className="profile-section">
          <p className="profile-label">Contact</p>
          <p className="profile-contact-value">
            {profile?.email ? maskContact(profile.email) : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
