export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';
export type NotificationEventType =
  | 'order_placed'
  | 'order_shipped'
  | 'order_delivered'
  | 'return_status_update'
  | 'refund_issued';

/**
 * Matrix: all channels × all event types. Default: all enabled.
 */
export type NotificationPreferences = Record<NotificationEventType, Record<NotificationChannel, boolean>>;

const CHANNELS: NotificationChannel[] = ['in_app', 'email', 'sms', 'push'];
const EVENT_TYPES: NotificationEventType[] = [
  'order_placed',
  'order_shipped',
  'order_delivered',
  'return_status_update',
  'refund_issued',
];

/**
 * Returns a NotificationPreferences object with all 5×4 combinations set to true.
 */
export function defaultAllEnabled(): NotificationPreferences {
  const prefs = {} as NotificationPreferences;
  for (const eventType of EVENT_TYPES) {
    prefs[eventType] = {} as Record<NotificationChannel, boolean>;
    for (const channel of CHANNELS) {
      prefs[eventType][channel] = true;
    }
  }
  return prefs;
}
