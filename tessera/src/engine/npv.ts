/**
 * Net Present Value and discounting primitives.
 *
 *   NPV = Sum_{t=0}^{N} CF_t / (1 + r)^t
 *
 * The cash-flow array is indexed from t = 0, so cashFlows[0] is the initial
 * outlay (normally negative) and receives a discount factor of exactly 1.
 */

export function discountFactor(rate: number, t: number): number {
  return 1 / Math.pow(1 + rate, t);
}

export function npv(rate: number, cashFlows: number[]): number {
  let total = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    total += cashFlows[t] / Math.pow(1 + rate, t);
  }
  return total;
}

/** Present value of the strictly positive cash flows. */
export function pvOfInflows(rate: number, cashFlows: number[]): number {
  let total = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    if (cashFlows[t] > 0) total += cashFlows[t] / Math.pow(1 + rate, t);
  }
  return total;
}

/** Present value of the strictly negative cash flows, returned as a positive magnitude. */
export function pvOfOutflows(rate: number, cashFlows: number[]): number {
  let total = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    if (cashFlows[t] < 0) total += cashFlows[t] / Math.pow(1 + rate, t);
  }
  return Math.abs(total);
}

/** Present value of an ordinary annuity of 1 per period for n periods. */
export function annuityFactor(rate: number, n: number): number {
  if (rate === 0) return n;
  return (1 - Math.pow(1 + rate, -n)) / rate;
}
