// src/application/catalog/DeliveryEstimate.ts

import type { CatalogConfig } from './CatalogConfig.js';

export interface DeliveryEstimate {
  earliestDate: string;  // ISO date string, e.g., "2026-06-18"
  latestDate: string;    // ISO date string, e.g., "2026-06-20"
  displayText: string;   // e.g., "Delivery by Jun 18–20"
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function toISODateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Computes a delivery date range from today based on the configured min/max days.
 * Returns ISO date strings and a human-readable display text.
 */
export function computeDeliveryEstimate(
  config: Pick<CatalogConfig, 'deliveryMinDays' | 'deliveryMaxDays'>,
): DeliveryEstimate {
  const today = new Date();
  const earliest = addDays(today, config.deliveryMinDays);
  const latest = addDays(today, config.deliveryMaxDays);

  const earliestMonth = MONTH_ABBR[earliest.getMonth()];
  const latestMonth = MONTH_ABBR[latest.getMonth()];
  const earliestDay = earliest.getDate();
  const latestDay = latest.getDate();

  let displayText: string;
  if (earliestMonth === latestMonth) {
    displayText = `Delivery by ${earliestMonth} ${earliestDay}\u2013${latestDay}`;
  } else {
    displayText = `Delivery by ${earliestMonth} ${earliestDay}\u2013${latestMonth} ${latestDay}`;
  }

  return {
    earliestDate: toISODateString(earliest),
    latestDate: toISODateString(latest),
    displayText,
  };
}
