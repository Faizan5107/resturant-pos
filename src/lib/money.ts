/**
 * Money formatting helper for restaurant POS.
 * Formats numeric values according to restaurant currency setting.
 * Default currency is PKR shown as "Rs".
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string = "PKR"
): string {
  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  const safeAmount = isNaN(numericAmount) ? 0 : numericAmount;

  if (currency.toUpperCase() === "PKR" || currency.toUpperCase() === "RS") {
    return `Rs ${safeAmount.toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${currency} ${safeAmount.toFixed(2)}`;
  }
}
