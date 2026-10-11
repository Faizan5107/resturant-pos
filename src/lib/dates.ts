import { format, parseISO } from "date-fns";

export const DEFAULT_TIMEZONE = "Asia/Karachi";
export const BUSINESS_DAY_CUTOFF_HOUR = 12; // 12:00 PM cutoff

/**
 * Formats a timestamp into human-readable date string (e.g. 29 Sep 2026).
 */
export function formatDate(date: string | Date | null | undefined, formatStr = "dd MMM yyyy"): string {
  if (!date) return "-";
  const d = typeof date === "string" ? parseISO(date) : date;
  if (isNaN(d.getTime())) return "-";
  return format(d, formatStr);
}

/**
 * Formats a timestamp into time string (e.g. 02:45 PM).
 */
export function formatTime(date: string | Date | null | undefined, formatStr = "hh:mm a"): string {
  if (!date) return "-";
  const d = typeof date === "string" ? parseISO(date) : date;
  if (isNaN(d.getTime())) return "-";
  return format(d, formatStr);
}

/**
 * Formats a timestamp into date + time string.
 */
export function formatDateTime(date: string | Date | null | undefined, formatStr = "dd MMM yyyy, hh:mm a"): string {
  if (!date) return "-";
  const d = typeof date === "string" ? parseISO(date) : date;
  if (isNaN(d.getTime())) return "-";
  return format(d, formatStr);
}

/**
 * Returns the restaurant business date.
 * Restaurant hours are 12:00 PM (12:00) to 2:00 AM (counted as a single day).
 * Any time between 00:00 and 11:59 belongs to the previous calendar day's shift.
 */
export function getBusinessDate(date: Date = new Date(), cutoffHour = BUSINESS_DAY_CUTOFF_HOUR): Date {
  const d = new Date(date);
  if (d.getHours() < cutoffHour) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/**
 * Returns YYYY-MM-DD for order date counters and shift reporting.
 */
export function getOrderDateString(date: Date = new Date(), cutoffHour = BUSINESS_DAY_CUTOFF_HOUR): string {
  return format(getBusinessDate(date, cutoffHour), "yyyy-MM-dd");
}

/**
 * Checks if a given timestamp falls on the specified business date (YYYY-MM-DD).
 */
export function isOrderInBusinessDate(orderCreatedAt: string | Date, targetBusinessDateStr: string, cutoffHour = BUSINESS_DAY_CUTOFF_HOUR): boolean {
  const d = typeof orderCreatedAt === "string" ? parseISO(orderCreatedAt) : orderCreatedAt;
  if (isNaN(d.getTime())) return false;
  const orderBizDateStr = format(getBusinessDate(d, cutoffHour), "yyyy-MM-dd");
  return orderBizDateStr === targetBusinessDateStr;
}

