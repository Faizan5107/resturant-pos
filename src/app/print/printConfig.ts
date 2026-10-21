/**
 * Thermal printer paper feed constants (in millimeters).
 * Controls the blank feed at the bottom of printed receipts.
 *
 * NOTE: This value depends on where the thermal printer's physical cutter blade sits
 * relative to the print head, and can be increased if the cutter cuts into the text.
 */
export const BILL_FEED_MM = 25;
export const KITCHEN_FEED_MM = 20;
