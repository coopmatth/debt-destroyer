/**
 * Money helpers, shared by the Plaid boundary, the API layer, and the UI.
 *
 * Everything inside the app is integer cents. Dollars exist only at the two
 * edges: values arriving from Plaid, and values typed into or rendered on a
 * form.
 */

/**
 * `amount * 100` is not safe on its own: 1.005 * 100 is 100.49999999999999 in
 * binary floating point, which rounds to 100 instead of 101. Shifting the
 * exponent in the *decimal* string representation avoids the intermediate
 * multiply entirely.
 */
export function dollarsToCents(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined) return null;
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Cannot convert non-finite amount to cents: ${amount}`);
  }

  const asString = `${amount}`;
  // Values already in exponential form (1e-7) can't take the string shift.
  const shifted =
    asString.includes("e") || asString.includes("E")
      ? amount * 100
      : Number(`${asString}e2`);

  return Math.round(shifted);
}

/** Balances owed are stored as positive magnitudes regardless of input sign. */
export function owedCents(amount: number | null | undefined): number {
  const cents = dollarsToCents(amount);
  return cents === null ? 0 : Math.abs(cents);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatCents(
  cents: number,
  options: { currency?: string; showCents?: boolean } = {},
): string {
  const { currency = "USD", showCents = true } = options;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(cents / 100);
}
