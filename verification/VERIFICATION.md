# TESSERA — Verification of Financial Correctness

**Project:** TESSERA — AI-Enabled Capital Budgeting Decision Application
**Author:** Gagandeep Singh
**Module:** Corporate Finance, MSc Artificial Intelligence with Business, SP Jain Dubai

The assignment brief requires that "calculations must be financially correct and
independently verified." This document records how that was done and what the
result was.

---

## 1. Why independent verification was necessary

A single implementation that agrees with itself proves nothing. A test suite
written against the same mental model as the code under test will reproduce the
author's misunderstandings faithfully. Verification here therefore rests on four
layers, each of which can catch errors the others cannot.

| Layer | What it can catch | What it cannot catch |
|---|---|---|
| 1. Hand-computed golden values | Arithmetic and formula errors | Errors repeated in the hand calculation |
| 2. Mathematical identities | Internal inconsistency between metrics | An error affecting all metrics equally |
| 3. Independent re-implementation | Author's coding errors | A shared misunderstanding of the finance |
| 4. Third-party library comparison | Shared misunderstanding of the finance | Errors in the library itself |

---

## 2. Layer 1 — Hand-computed golden values

`tessera/src/engine/engine.test.ts` contains **63 tests**. Every expected value
is either derived by hand, with the working written out longhand in a comment
above the assertion, or is a mathematical identity. No expected value was copied
from the engine's own output.

Representative example — Alternative A, Year 1, built up from first principles:

```
Available hours   = 32 GPUs x 8,760 h x 96% availability   = 269,107.20
Utilised hours    = 269,107.20 x 65%                       = 174,919.68
Internal revenue  = 174,919.68 x 60% x AED 20.20           = 2,120,026.5216
External revenue  = 174,919.68 x 40% x AED 14.70           = 1,028,527.7184
Revenue                                                    = 3,148,554.2400
Variable cost     = 174,919.68 x AED 0.70                  =   122,443.7760
Fixed cost        = 520,000 + 320,000 + 110,000 + 86,000   = 1,036,000.0000
Depreciation      = (6,560,000 - 1,054,800) / 5            = 1,101,040.0000
EBIT                                                       =   889,070.4640
Tax at 9%                                                  =    80,016.3418
Net income                                                 =   809,054.1222
Operating cash flow = 809,054.1222 + 1,101,040             = 1,910,094.1222
```

The engine returns `1,910,094.12224`. Exact agreement.

**Three of my own hand calculations were wrong and the tests caught them**, all
through rounding carried too far into the comparison: the MIRR worked example
(0.1316847 against the correct 0.13168560), the EAA worked example (20.792494
against 20.792452), and the Year-5 fixed cost (1,441,776.78 against
1,441,776.78561). In each case the engine was right and the hand value was
re-derived at full precision. This is recorded here because it is the clearest
evidence that the tests are doing real work rather than restating the code.

---

## 3. Layer 2 — Mathematical identities checked at runtime

Seven identities are asserted on **every** model evaluation, not only in tests,
so a bad input combination at runtime is caught rather than silently displayed:

| Check | Identity | Why it matters |
|---|---|---|
| `NPV(IRR) = 0` | Substituting the returned IRR back into the NPV formula must give zero | Catches a root solver that returns a plausible but wrong rate |
| `PI identity` | `PI = 1 + NPV / \|PV(outflows)\|` | Links PI to NPV; catches a mis-signed or mis-scaled PI |
| `MIRR two ways` | Closed-form ratio must equal the IRR of the collapsed `[-PV_neg, 0…0, FV_pos]` series | Two computationally unrelated routes to one number |
| `Depreciation reconciliation` | `Sum of annual depreciation = capitalised cost − closing book value` | Catches an off-by-one in the schedule |
| `Working capital recovery` | Total released at the end = total committed over the life | Catches working capital leaking out of the model |
| `OCF tax-shield identity` | `(R−VC−FC)(1−t) + t·D` must equal `(R−VC−FC−D)(1−t) + D` | Independent algebraic route to operating cash flow |
| `NPV cross-foot` | NPV accumulated from the per-year present values equals NPV of the cash-flow series | Catches divergence between the display rows and the metrics |

**Result: all 7 checks pass for all 4 modelled options.**

---

## 4. Layers 3 and 4 — Independent Python re-implementation

`verification/verify_model.py` is a separate implementation of the same model:

- written in **Python**, not TypeScript;
- transcribed from the **scenario specification**, not from the TypeScript source;
- using **numpy-financial 1.0.0** (`npf.npv`, `npf.irr`, `npf.mirr`) in place of
  the hand-rolled solvers in the application;
- sharing **no code whatsoever** with the application.

It re-derives the WACC from CAPM independently, rebuilds all four cash-flow
series, recomputes every metric, and compares against a JSON export of the
TypeScript engine's results.

### Result

```
79 of 79 comparisons agree.
VERIFICATION PASSED — the two independent implementations agree on every quantity.
```

Typical agreement is to **exactly zero** absolute difference; the largest
disagreement anywhere is **4.66 × 10⁻¹⁰ AED**, which is floating-point
representation noise, not a modelling difference.

Full output: [`verification-output.txt`](verification-output.txt).

### Reproducing it

```bash
cd tessera && npx vite-node scripts/export-results.ts && cd .. && python verification/verify_model.py
```

---

## 5. A real disagreement, and what it exposed

The first verification run produced **78 of 79** agreements. The single
disagreement was the IRR of the five-year diagnostic variant of the reserved
commitment (B5), where numpy-financial returned a rate and the TypeScript engine
returned `null`.

Investigation showed the engine was right to be suspicious but wrong in how it
got there. B5's cash flows turn negative in years 4 and 5, once the locked
contract rate exceeds the falling market price:

```
-45,000   +130,600   +556,019   +264,756   -3,207   -249,732
```

Two sign changes, so by Descartes' rule of signs there can be up to two real
IRRs — and there are. The original solver bracketed the search range once, found
NPV negative at both ends, and gave up. It returned `null` **by accident**, not
because it had detected the ambiguity.

The solver was rewritten to sweep the NPV curve across the search range, locate
every interval in which it changes sign, and bisect each one. It now reports:

```
IRR (non-conventional, 2 roots)   numpy: -0.377872   engine: {-0.377872, +4.390070}
```

numpy-financial's companion-matrix method returns whichever single root it
happens to converge on. The engine returns the full set and sets
`isConventional = false`, so the interface can warn the user that IRR is
ambiguous here and that NPV and MIRR — which remain well defined regardless of
sign pattern — should be used instead.

This is worth recording for two reasons. First, it is the clearest demonstration
that cross-implementation verification catches things a single implementation
plus its own tests never will. Second, the multiple-IRR problem is normally
taught with a contrived textbook example; here it arose unprompted from a
realistic contract structure, and the application now detects and explains it on
a live case.

---

## 6. Edge cases explicitly handled and tested

| Case | Treatment |
|---|---|
| Non-conventional cash flows | All roots reported; `isConventional` false; UI defers to NPV/MIRR |
| No sign change at all | IRR reported as undefined rather than a spurious number |
| Realised salvage above book value | Gain on disposal taxed at 9% |
| Realised salvage below book value | Loss on disposal generates a tax credit |
| Depreciation schedule vs realised salvage | Held separate, so salvage sensitivity produces a genuine disposal gain or loss rather than silently re-writing history |
| Operating losses | Group-relief tax shield is an explicit toggle, not an assumption |
| Salvage estimate above depreciable base | Depreciation floored at zero rather than going negative |
| Contractual options with near-zero capital | Flagged `ratioMetricsMeaningful = false`; IRR, PI, ARR and payback are suppressed as meaningless, NPV and EAA retained |
| Unequal project lives | Equivalent Annual Annuity computed automatically |

---

## 7. Summary

| Layer | Result |
|---|---|
| Hand-computed golden values | 63 / 63 tests pass |
| Runtime mathematical identities | 7 / 7 checks pass on all 4 options |
| Independent Python re-implementation | 79 / 79 comparisons agree |
| Third-party library (numpy-financial) | Agrees on every quantity |

The figures reported by the TESSERA application are financially correct to the
limits of double-precision arithmetic.
