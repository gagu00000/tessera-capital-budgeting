/**
 * Display formatting.
 *
 * Kept apart from the engine so that rounding for the screen can never leak back
 * into a calculation. Everything here takes a full-precision number and returns
 * a string.
 */

const AED = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 });
const AED_2DP = new Intl.NumberFormat('en-AE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** AED with thousands separators and no decimals, e.g. "-7,060,000". */
export function money(value: number): string {
  return AED.format(Math.round(value));
}

/** AED with an explicit sign, for deltas and cash flows. */
export function signedMoney(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '−'}${AED.format(Math.abs(rounded))}`;
}

/** Compact AED for tight spaces, e.g. "7.06M", "726k". */
export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${Math.round(abs)}`;
}

/** A per-unit rate, e.g. "20.20". */
export function rate(value: number): string {
  return AED_2DP.format(value);
}

/** A decimal fraction as a percentage, e.g. 0.1254 -> "12.54%". */
export function percent(value: number | null, dp = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(dp)}%`;
}

/** A count of years, e.g. 3.803 -> "3.80 yrs". Null means never recovered. */
export function years(value: number | null, dp = 2): string {
  if (value === null) return 'Never';
  return `${value.toFixed(dp)} yrs`;
}

/** A plain ratio, e.g. 1.190 -> "1.190". */
export function ratio(value: number, dp = 3): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(dp);
}

/** Large hour counts, e.g. "174,920 h". */
export function hours(value: number): string {
  return `${AED.format(Math.round(value))} h`;
}

/** Formats a sensitivity driver value according to its declared format. */
export function driverValue(
  value: number,
  format: 'percent' | 'multiple' | 'currency' | 'rate',
): string {
  switch (format) {
    case 'percent':
      return percent(value, 1);
    case 'multiple':
      return `${value.toFixed(2)}×`;
    case 'currency':
      return `AED ${AED_2DP.format(value)}`;
    case 'rate':
      return percent(value, 2);
  }
}
