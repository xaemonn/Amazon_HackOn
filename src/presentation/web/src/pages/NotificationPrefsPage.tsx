import { useState, useEffect, useCallback, useRef } from 'react';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useAuth } from '../hooks/useAuth';
import './NotificationPrefsPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/**
 * Notification event types and channels — mirrors the domain types.
 */
type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';
type NotificationEventType =
  | 'order_placed'
  | 'order_shipped'
  | 'order_delivered'
  | 'return_status_update'
  | 'refund_issued';

type NotificationPreferences = Record<NotificationEventType, Record<NotificationChannel, boolean>>;

const EVENT_TYPES: NotificationEventType[] = [
  'order_placed',
  'order_shipped',
  'order_delivered',
  'return_status_update',
  'refund_issued',
];

const CHANNELS: NotificationChannel[] = ['in_app', 'email', 'sms', 'push'];

/** User-friendly labels for event types */
const EVENT_TYPE_LABELS: Record<NotificationEventType, string> = {
  order_placed: 'Order Placed',
  order_shipped: 'Order Shipped',
  order_delivered: 'Order Delivered',
  return_status_update: 'Return Status Update',
  refund_issued: 'Refund Issued',
};

/** User-friendly labels for channels */
const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'In-App',
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
};

/**
 * NotificationPrefsPage — displays a 5 event types × 4 channels toggle grid.
 * Each toggle performs an optimistic update and reverts on API error with a toast.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 15.1
 */
export function NotificationPrefsPage() {
  const { sessionToken } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch preferences on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchPreferences() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/account/notifications`, {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        });

        if (!res.ok) {
          throw new Error('Failed to load notification preferences');
        }

        const data: NotificationPreferences = await res.json();
        if (!cancelled) {
          setPreferences(data);
        }
      } catch {
        if (!cancelled) {
          showToast('Failed to load notification preferences. Please try again.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPreferences();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const showToast = useCallback((message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3000);
  }, []);

  // Clean up toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const handleToggle = useCallback(
    async (eventType: NotificationEventType, channel: NotificationChannel) => {
      if (!preferences) return;

      const previousValue = preferences[eventType][channel];
      const newValue = !previousValue;

      // Optimistic update — toggle instantly
      setPreferences((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [eventType]: {
            ...prev[eventType],
            [channel]: newValue,
          },
        };
      });

      // Send partial update to API
      try {
        const body: Partial<NotificationPreferences> = {
          [eventType]: {
            ...preferences[eventType],
            [channel]: newValue,
          },
        };

        const res = await fetch(`${API_BASE_URL}/api/account/notifications`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error('Failed to update preference');
        }
      } catch {
        // Revert on error
        setPreferences((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            [eventType]: {
              ...prev[eventType],
              [channel]: previousValue,
            },
          };
        });
        showToast('Failed to update preference. Please try again.');
      }
    },
    [preferences, sessionToken, showToast]
  );

  // Render skeleton loader while fetching data
  if (loading) {
    return (
      <div className="notification-prefs-page">
        <h1 className="notification-prefs-title">Notification Preferences</h1>
        <div className="notification-prefs-skeleton" aria-busy="true" aria-label="Loading notification preferences">
          <SkeletonLoader height="2.5rem" width="100%" />
          <SkeletonLoader height="3rem" width="100%" />
          <SkeletonLoader height="3rem" width="100%" />
          <SkeletonLoader height="3rem" width="100%" />
          <SkeletonLoader height="3rem" width="100%" />
          <SkeletonLoader height="3rem" width="100%" />
        </div>
      </div>
    );
  }

  if (!preferences) {
    return (
      <div className="notification-prefs-page">
        <h1 className="notification-prefs-title">Notification Preferences</h1>
        <p>Unable to load preferences. Please refresh the page.</p>
      </div>
    );
  }

  return (
    <div className="notification-prefs-page">
      <h1 className="notification-prefs-title">Notification Preferences</h1>

      <div className="notification-prefs-matrix" role="grid" aria-label="Notification preferences matrix">
        {/* Header row — channel labels */}
        <div className="notification-prefs-header" role="row">
          <span className="notification-prefs-header-spacer" role="columnheader">Event</span>
          {CHANNELS.map((channel) => (
            <span
              key={channel}
              className="notification-prefs-header-label"
              role="columnheader"
            >
              {CHANNEL_LABELS[channel]}
            </span>
          ))}
        </div>

        {/* One row per event type */}
        {EVENT_TYPES.map((eventType) => (
          <div key={eventType} className="notification-prefs-row" role="row">
            <span className="notification-prefs-event-label" role="rowheader">
              {EVENT_TYPE_LABELS[eventType]}
            </span>
            {CHANNELS.map((channel) => (
              <div key={channel} className="notification-toggle" role="gridcell">
                <input
                  type="checkbox"
                  className="notification-toggle-input"
                  checked={preferences[eventType][channel]}
                  onChange={() => handleToggle(eventType, channel)}
                  aria-label={`${EVENT_TYPE_LABELS[eventType]} via ${CHANNEL_LABELS[channel]}`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Error toast */}
      {toastMessage && (
        <div className="notification-prefs-toast" role="alert" aria-live="assertive">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
