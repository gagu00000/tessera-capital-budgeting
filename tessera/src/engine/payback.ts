/**
 * Payback Period and Discounted Payback Period.
 *
 * Both are computed on cumulative cash flow with linear interpolation inside
 * the recovery year:
 *
 *   Payback = (years fully elapsed) + (unrecovered balance at start of year)
 *                                     / (cash flow during recovery year)
 *
 * Returns null when the outlay is never recovered inside the project life —
 * which is a genuine and reportable result, not an error.
 */

/**
 * @param cashFlows  Full series indexed from t=0 (element 0 = initial outlay).
 * @param rate       Discount rate. Pass 0 for simple (undiscounted) payback.
 */
export function paybackPeriod(cashFlows: number[], rate = 0): number | null {
  let cumulative = 0;
  let previousCumulative = 0;

  for (let t = 0; t < cashFlows.length; t++) {
    const discounted = cashFlows[t] / Math.pow(1 + rate, t);
    previousCumulative = cumulative;
    cumulative += discounted;

    // t = 0 is the outlay itself; recovery can only occur from t >= 1.
    if (t > 0 && previousCumulative < 0 && cumulative >= 0) {
      const unrecovered = -previousCumulative;
      if (discounted === 0) return t;
      return t - 1 + unrecovered / discounted;
    }
  }
  return null;
}

export function discountedPaybackPeriod(cashFlows: number[], rate: number): number | null {
  return paybackPeriod(cashFlows, rate);
}
