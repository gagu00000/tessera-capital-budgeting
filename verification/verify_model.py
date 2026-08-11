"""
TESSERA — independent verification of the capital budgeting engine.

The application's financial model is written in TypeScript. This script is a
deliberately SEPARATE re-implementation of the same model in Python, written
from the scenario specification rather than from the TypeScript source, and
using numpy-financial's NPV / IRR / MIRR routines instead of the hand-rolled
solvers in the application.

The two implementations share no code. Agreement between them is therefore
meaningful evidence that the numbers reported by the application are correct,
which is what the assignment brief means by "independently verified".

Usage:
    cd tessera && npx vite-node scripts/export-results.ts
    cd .. && python verification/verify_model.py

Author: Gagandeep Singh
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import numpy_financial as npf

HERE = Path(__file__).resolve().parent
TS_RESULTS = HERE / "ts-results.json"

# Tolerances. Money is compared to a hundredth of a fils; rates to 1e-9.
TOL_MONEY = 1e-4
TOL_RATE = 1e-9
TOL_YEARS = 1e-9


# ===========================================================================
# Independent model
# ===========================================================================

@dataclass
class FixedCost:
    label: str
    year1_amount: float
    start_year: int


@dataclass
class Project:
    ident: str
    label: str
    equipment_cost: float
    install_transport_cost: float
    working_capital: float
    life_years: int
    gpu_count: int
    hours_per_year: int
    availability: float
    utilisation: list[float]
    internal_share: float
    internal_rate_y1: float
    external_rate_y1: float
    price_erosion: float
    variable_cost_per_hour: float
    fixed_costs: list[FixedCost]
    fixed_cost_escalation: float
    salvage_rate: float
    depreciation_to_salvage: bool
    tax_rate: float
    wacc: float
    reinvestment_rate: float
    finance_rate: float
    salvage_estimate_rate: float | None = None

    # Populated by build()
    cash_flows: list[float] = field(default_factory=list)
    net_income: list[float] = field(default_factory=list)
    annual_depreciation: float = 0.0
    closing_book_value: float = 0.0
    salvage_value: float = 0.0

    def depreciable_base(self) -> float:
        return self.equipment_cost + self.install_transport_cost

    def build(self) -> None:
        base = self.depreciable_base()
        self.salvage_value = self.salvage_rate * self.equipment_cost

        estimate_rate = (
            self.salvage_estimate_rate
            if self.salvage_estimate_rate is not None
            else self.salvage_rate
        )
        target = estimate_rate * self.equipment_cost if self.depreciation_to_salvage else 0.0
        self.annual_depreciation = max(0.0, (base - target) / self.life_years)
        self.closing_book_value = base - self.annual_depreciation * self.life_years

        available = self.gpu_count * self.hours_per_year * self.availability

        flows = [-(base + self.working_capital)]
        self.net_income = []

        for t in range(1, self.life_years + 1):
            used = available * self.utilisation[t - 1]
            erosion = (1.0 - self.price_erosion) ** (t - 1)
            internal_rate = self.internal_rate_y1 * erosion
            external_rate = self.external_rate_y1 * erosion

            revenue = (
                used * self.internal_share * internal_rate
                + used * (1.0 - self.internal_share) * external_rate
            )
            variable = used * self.variable_cost_per_hour

            escalator = (1.0 + self.fixed_cost_escalation) ** (t - 1)
            fixed = sum(
                fc.year1_amount * escalator for fc in self.fixed_costs if t >= fc.start_year
            )

            ebit = revenue - variable - fixed - self.annual_depreciation
            tax = ebit * self.tax_rate  # group relief assumed on losses
            net_income = ebit - tax
            ocf = net_income + self.annual_depreciation

            self.net_income.append(net_income)

            if t == self.life_years:
                gain = self.salvage_value - self.closing_book_value
                after_tax_salvage = self.salvage_value - gain * self.tax_rate
                ocf += after_tax_salvage + self.working_capital

            flows.append(ocf)

        self.cash_flows = flows

    # ---- metrics, via numpy-financial where one exists --------------------

    def npv(self) -> float:
        return float(npf.npv(self.wacc, self.cash_flows))

    def irr(self) -> float:
        return float(npf.irr(self.cash_flows))

    def mirr(self) -> float:
        return float(npf.mirr(self.cash_flows, self.finance_rate, self.reinvestment_rate))

    def pv_inflows(self) -> float:
        return float(
            sum(cf / (1 + self.wacc) ** t for t, cf in enumerate(self.cash_flows) if cf > 0)
        )

    def pv_outflows(self) -> float:
        return abs(
            float(
                sum(cf / (1 + self.wacc) ** t for t, cf in enumerate(self.cash_flows) if cf < 0)
            )
        )

    def profitability_index(self) -> float:
        return self.pv_inflows() / self.pv_outflows()

    def payback(self, rate: float = 0.0) -> float | None:
        cumulative = 0.0
        for t, cf in enumerate(self.cash_flows):
            discounted = cf / (1 + rate) ** t
            previous = cumulative
            cumulative += discounted
            if t > 0 and previous < 0 <= cumulative:
                return t - 1 + (-previous) / discounted
        return None

    def arr(self) -> float:
        average_pat = sum(self.net_income) / len(self.net_income)
        average_investment = (self.depreciable_base() + self.closing_book_value) / 2
        return average_pat / average_investment

    def arr_initial_basis(self) -> float:
        average_pat = sum(self.net_income) / len(self.net_income)
        return average_pat / (self.depreciable_base() + self.working_capital)

    def eaa(self) -> float:
        af = (1 - (1 + self.wacc) ** -self.life_years) / self.wacc
        return self.npv() / af


# ===========================================================================
# Scenario, transcribed independently from the specification
# ===========================================================================

TAX = 0.09
HOURS = 8760
AVAILABILITY = 0.96
EROSION = 0.08
ON_DEMAND = 20.20
RESALE = 14.70
RESERVED = 15.75
VARIABLE = 0.70
ESCALATION = 0.03

# WACC, derived from CAPM:
#   D/E   = 0.30 / 0.70
#   BetaL = 1.25 * (1 + (1 - 0.09) * 0.30/0.70)
#   Ke    = 0.043 + BetaL * 0.056 + 0.020
#   Kd(1-t) = 0.059 * (1 - 0.09)
#   WACC  = 0.70 * Ke + 0.30 * Kd(1-t)
BETA_L = 1.25 * (1 + (1 - TAX) * (0.30 / 0.70))
KE = 0.043 + BETA_L * 0.056 + 0.020
KD_AFTER_TAX = 0.059 * (1 - TAX)
WACC = 0.70 * KE + 0.30 * KD_AFTER_TAX

COMMITMENT_LEVEL = 0.80
COMMITTED_HOURS = 32 * HOURS * AVAILABILITY * COMMITMENT_LEVEL

RATE_ARGS = dict(
    hours_per_year=HOURS,
    availability=AVAILABILITY,
    price_erosion=EROSION,
    fixed_cost_escalation=ESCALATION,
    tax_rate=TAX,
    wacc=WACC,
    reinvestment_rate=WACC,
    finance_rate=KD_AFTER_TAX,
)

ALT_A = Project(
    ident="A",
    label="Own - Full 32-GPU Cluster",
    equipment_cost=5_860_000,
    install_transport_cost=700_000,
    working_capital=500_000,
    life_years=5,
    gpu_count=32,
    utilisation=[0.65, 0.80, 0.85, 0.84, 0.78],
    internal_share=0.60,
    internal_rate_y1=ON_DEMAND,
    external_rate_y1=RESALE,
    variable_cost_per_hour=VARIABLE,
    fixed_costs=[
        FixedCost("Colocation space & cooling (4 racks)", 520_000, 1),
        FixedCost("Hardware support & warranty contract", 245_000, 2),
        FixedCost("Platform / MLOps engineer (1.0 FTE)", 320_000, 1),
        FixedCost("Insurance, licences & monitoring", 110_000, 1),
        FixedCost("Foregone sublease (opportunity cost)", 86_000, 1),
    ],
    salvage_rate=0.18,
    salvage_estimate_rate=0.18,
    depreciation_to_salvage=True,
    **RATE_ARGS,
)

ALT_B = Project(
    ident="B",
    label="Rent - 3-Year Reserved Commitment",
    equipment_cost=0,
    install_transport_cost=45_000,
    working_capital=0,
    life_years=3,
    gpu_count=32,
    utilisation=[0.65, COMMITMENT_LEVEL, COMMITMENT_LEVEL],
    internal_share=1.0,
    internal_rate_y1=ON_DEMAND,
    external_rate_y1=0.0,
    variable_cost_per_hour=0.0,
    fixed_costs=[
        FixedCost("Reserved capacity commitment", COMMITTED_HOURS * RESERVED, 1),
    ],
    salvage_rate=0.0,
    depreciation_to_salvage=False,
    **{**RATE_ARGS, "fixed_cost_escalation": 0.0},
)

ALT_C = Project(
    ident="C",
    label="Hybrid - Own 16 GPUs, Burst to Cloud",
    equipment_cost=3_110_000,
    install_transport_cost=420_000,
    working_capital=300_000,
    life_years=5,
    gpu_count=16,
    utilisation=[0.90, 0.92, 0.92, 0.90, 0.86],
    internal_share=0.85,
    internal_rate_y1=ON_DEMAND,
    external_rate_y1=RESALE,
    variable_cost_per_hour=VARIABLE,
    fixed_costs=[
        FixedCost("Colocation space & cooling (2 racks)", 260_000, 1),
        FixedCost("Hardware support & warranty contract", 125_000, 2),
        FixedCost("Platform / MLOps engineer (0.6 FTE)", 200_000, 1),
        FixedCost("Insurance, licences & monitoring", 70_000, 1),
        FixedCost("Foregone sublease (opportunity cost)", 86_000, 1),
    ],
    salvage_rate=0.18,
    salvage_estimate_rate=0.18,
    depreciation_to_salvage=True,
    **RATE_ARGS,
)

ALT_B5 = Project(
    ident="B5",
    label="Rent - Same Commitment Held for 5 Years (diagnostic)",
    equipment_cost=0,
    install_transport_cost=45_000,
    working_capital=0,
    life_years=5,
    gpu_count=32,
    utilisation=[0.65] + [COMMITMENT_LEVEL] * 4,
    internal_share=1.0,
    internal_rate_y1=ON_DEMAND,
    external_rate_y1=0.0,
    variable_cost_per_hour=0.0,
    fixed_costs=[
        FixedCost("Reserved capacity commitment", COMMITTED_HOURS * RESERVED, 1),
    ],
    salvage_rate=0.0,
    depreciation_to_salvage=False,
    **{**RATE_ARGS, "fixed_cost_escalation": 0.0},
)

PROJECTS = {p.ident: p for p in (ALT_A, ALT_B, ALT_C, ALT_B5)}


# ===========================================================================
# Comparison harness
# ===========================================================================

class Report:
    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str, str, float, float, bool]] = []

    @staticmethod
    def _fmt(value) -> str:
        return "None" if value is None else f"{float(value):,.6f}"

    def compare(self, alt: str, name: str, python_value, ts_value, tol: float) -> None:
        if python_value is None or ts_value is None:
            ok = python_value is None and ts_value is None
            self.rows.append(
                (alt, name, self._fmt(python_value), self._fmt(ts_value), float("nan"), tol, ok)
            )
            return
        delta = abs(float(python_value) - float(ts_value))
        self.rows.append(
            (alt, name, self._fmt(python_value), self._fmt(ts_value), delta, tol, delta <= tol)
        )

    def compare_membership(self, alt: str, name: str, python_value, ts_roots, tol: float) -> None:
        """Passes when numpy's single root matches ANY of the engine's roots."""
        if python_value is None:
            ok = len(ts_roots) == 0
            self.rows.append((alt, name, "None", self._fmt_roots(ts_roots), float("nan"), tol, ok))
            return
        if not ts_roots:
            self.rows.append((alt, name, self._fmt(python_value), "none found", float("nan"), tol, False))
            return
        delta = min(abs(float(python_value) - float(r)) for r in ts_roots)
        self.rows.append(
            (alt, name, self._fmt(python_value), self._fmt_roots(ts_roots), delta, tol, delta <= tol)
        )

    @staticmethod
    def _fmt_roots(roots) -> str:
        if not roots:
            return "none"
        return "{" + ", ".join(f"{float(r):.6f}" for r in roots) + "}"

    @property
    def failures(self) -> list:
        return [r for r in self.rows if not r[6]]

    def render(self) -> str:
        lines = [
            "",
            "=" * 108,
            "TESSERA — INDEPENDENT VERIFICATION",
            "TypeScript engine  vs  Python / numpy-financial re-implementation",
            "=" * 108,
            "",
            f"{'Alt':<5}{'Quantity':<38}{'Python':>20}{'TypeScript':>24}{'|delta|':>12}{'Result':>9}",
            "-" * 108,
        ]
        for alt, name, py, ts, delta, _tol, ok in self.rows:
            delta_text = "-" if np.isnan(delta) else f"{delta:.2e}"
            lines.append(
                f"{alt:<5}{name:<38}{py:>20}{ts:>24}{delta_text:>12}"
                f"{'PASS' if ok else 'FAIL':>9}"
            )
        lines.append("-" * 108)
        total = len(self.rows)
        passed = total - len(self.failures)
        lines.append(f"{passed} of {total} comparisons agree.")
        lines.append("")
        return "\n".join(lines)


def main() -> int:
    if not TS_RESULTS.exists():
        print(
            f"ERROR: {TS_RESULTS} not found.\n"
            "Generate it first:  cd tessera && npx vite-node scripts/export-results.ts",
            file=sys.stderr,
        )
        return 2

    ts = json.loads(TS_RESULTS.read_text(encoding="utf8"))
    report = Report()

    # The discount rate itself is derived independently on both sides.
    report.compare("--", "WACC (derived)", WACC, ts["wacc"], TOL_RATE)

    for ts_alt in ts["alternatives"]:
        ident = ts_alt["id"]
        project = PROJECTS.get(ident)
        if project is None:
            continue
        project.build()

        report.compare(ident, "Initial cash flow", project.cash_flows[0], ts_alt["cashFlows"][0], TOL_MONEY)

        for t in range(1, project.life_years + 1):
            report.compare(
                ident, f"Net cash flow, year {t}", project.cash_flows[t], ts_alt["cashFlows"][t], TOL_MONEY
            )

        report.compare(ident, "Annual depreciation", project.annual_depreciation, ts_alt["annualDepreciation"], TOL_MONEY)
        report.compare(ident, "Salvage value", project.salvage_value, ts_alt["salvageValue"], TOL_MONEY)
        report.compare(ident, "Terminal cash flow", _terminal(project), ts_alt["terminal"]["total"], TOL_MONEY)

        report.compare(ident, "NPV", project.npv(), ts_alt["npv"], TOL_MONEY)
        report.compare(ident, "PV of inflows", project.pv_inflows(), ts_alt["pvOfInflows"], TOL_MONEY)
        report.compare(ident, "PV of outflows", project.pv_outflows(), ts_alt["pvOfOutflows"], TOL_MONEY)
        report.compare(ident, "Profitability Index", project.profitability_index(), ts_alt["profitabilityIndex"], TOL_RATE)
        report.compare(ident, "MIRR", project.mirr(), ts_alt["mirr"], TOL_RATE)
        report.compare(ident, "ARR (average investment)", project.arr(), ts_alt["arr"], TOL_RATE)
        report.compare(ident, "ARR (initial investment)", project.arr_initial_basis(), ts_alt["arrInitialBasis"], TOL_RATE)
        report.compare(ident, "Equivalent Annual Annuity", project.eaa(), ts_alt["equivalentAnnualAnnuity"], TOL_MONEY)
        report.compare(ident, "Payback period", project.payback(0.0), ts_alt["paybackPeriod"], TOL_YEARS)
        report.compare(ident, "Discounted payback", project.payback(project.wacc), ts_alt["discountedPaybackPeriod"], TOL_YEARS)

        # IRR needs care when the cash-flow series is non-conventional. numpy's
        # irr() returns whichever single root its companion-matrix method lands
        # on; the TypeScript engine sweeps for every root and reports the set.
        # The correct check is therefore that numpy's answer is a MEMBER of that
        # set — not that it equals the engine's first root.
        try:
            py_irr = project.irr()
            py_irr = None if np.isnan(py_irr) else float(py_irr)
        except Exception:
            py_irr = None

        ts_roots = ts_alt.get("irrRoots") or []
        if ts_alt["irrIsConventional"]:
            report.compare(ident, "IRR", py_irr, ts_alt["irr"], TOL_RATE)
        else:
            report.compare_membership(
                ident,
                f"IRR (non-conventional, {len(ts_roots)} roots)",
                py_irr,
                ts_roots,
                TOL_RATE,
            )

    print(report.render())

    # Also surface the TypeScript engine's own internal consistency checks.
    print("Internal consistency checks reported by the TypeScript engine:")
    for ts_alt in ts["alternatives"]:
        state = "all pass" if ts_alt["allChecksPass"] else "FAILURES PRESENT"
        print(f"  Alt {ts_alt['id']:<3} {len(ts_alt['checks'])} checks — {state}")
        for check in ts_alt["checks"]:
            if not check["passed"]:
                print(f"      FAIL {check['name']}  delta={check['delta']:.3e}")
    print()

    if report.failures:
        print(f"VERIFICATION FAILED — {len(report.failures)} comparison(s) disagree.")
        return 1

    print("VERIFICATION PASSED — the two independent implementations agree on every quantity.")
    return 0


def _terminal(project: Project) -> float:
    gain = project.salvage_value - project.closing_book_value
    after_tax_salvage = project.salvage_value - gain * project.tax_rate
    return after_tax_salvage + project.working_capital


if __name__ == "__main__":
    raise SystemExit(main())
