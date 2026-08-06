// Pure salary computation — the money spine. No DB, no Date. Rupees (not paise),
// rounded to 2 decimals. Inputs come from the attendance month summary
// (payableDays = Σ day-values, lateMarksInMonth = un-waived late count) + the
// employee's salary profile.

export interface SalaryInput {
  annualCtc: number;        // rupees/year
  payableDays: number;      // Σ day-values for the month (PL=1, A/LWP=0, HP=2, H-H/D=1.5, H/D=0.5…)
  daysInMonth: number;      // calendar days in the month (28–31)
  ptExempt: boolean;        // professional tax exemption
  tdsMonthly: number;       // fixed ₹/month
  lateMarksInMonth: number; // un-waived lates (every 3rd → 0.5 day cut)
  advances: number;         // ₹ taken this month
  pendingBalanceIn: number; // ₹ carried in from a prior month's unpaid remainder
}

export type PayBasis = "monthly_ctc" | "hourly" | "fixed_fee";

export interface SalaryBreakdown {
  monthlyCtc: number;
  perDay: number;
  payableDays: number;
  lateDeductionDays: number;
  effectiveDays: number;    // payableDays - lateDeductionDays
  gross: number;
  pt: number;
  tds: number;
  advances: number;
  pendingBalanceIn: number;
  net: number;
  // Which formula produced this breakdown + the basis-specific figures the
  // payslip renders. Optional so the day-based (monthly_ctc) shape is unchanged.
  basis?: PayBasis;
  workedHours?: number;     // hourly
  targetHours?: number;     // hourly: 27 × daysInMonth/7
  hourlyRate?: number;      // hourly
  fee?: number;             // fixed_fee
}

// Part-time hourly input. Pay = min(rate × actual hours, monthlyPayAtTarget),
// where rate = monthlyPayAtTarget / (weeklyTargetHours × daysInMonth/7).
export interface HourlySalaryInput {
  monthlyPayAtTarget: number; // ₹ at full target (e.g. 3500)
  weeklyTargetHours: number;  // e.g. 27
  daysInMonth: number;        // 28–31
  workedMinutes: number;      // actual minutes worked this month
  ptExempt: boolean;
  tdsMonthly: number;
  advances: number;
  pendingBalanceIn: number;
}

// Project/remote fixed fee. Gross = the retainer, unaffected by attendance.
export interface FixedFeeSalaryInput {
  monthlyFee: number;
  tdsMonthly: number;
  advances: number;
  pendingBalanceIn: number;
}

const PT_AMOUNT = 200;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeSalary(input: SalaryInput): SalaryBreakdown {
  const monthlyCtc = round2(input.annualCtc / 12);
  const perDay = input.daysInMonth > 0 ? monthlyCtc / input.daysInMonth : 0;
  const lateDeductionDays = Math.floor(input.lateMarksInMonth / 3) * 0.5;
  const effectiveDays = input.payableDays - lateDeductionDays;
  const gross = round2(perDay * effectiveDays);
  const pt = input.ptExempt ? 0 : PT_AMOUNT;
  const net = round2(gross - pt - input.tdsMonthly - input.advances + input.pendingBalanceIn);
  return {
    monthlyCtc,
    perDay: round2(perDay),
    payableDays: input.payableDays,
    lateDeductionDays,
    effectiveDays,
    gross,
    pt,
    tds: input.tdsMonthly,
    advances: input.advances,
    pendingBalanceIn: input.pendingBalanceIn,
    net,
    basis: "monthly_ctc",
  };
}

/** Part-time hourly pay, prorated by worked hours and CAPPED at the target pay. */
export function computeHourlySalary(i: HourlySalaryInput): SalaryBreakdown {
  const targetHours = i.weeklyTargetHours * (i.daysInMonth / 7);
  const hourlyRate = targetHours > 0 ? i.monthlyPayAtTarget / targetHours : 0;
  const workedHours = i.workedMinutes / 60;
  const gross = round2(Math.min(hourlyRate * workedHours, i.monthlyPayAtTarget));
  const pt = i.ptExempt ? 0 : PT_AMOUNT;
  const net = round2(gross - pt - i.tdsMonthly - i.advances + i.pendingBalanceIn);
  return {
    monthlyCtc: 0, perDay: 0, payableDays: 0, lateDeductionDays: 0, effectiveDays: 0,
    gross, pt, tds: i.tdsMonthly, advances: i.advances, pendingBalanceIn: i.pendingBalanceIn, net,
    basis: "hourly", workedHours: round2(workedHours), targetHours: round2(targetHours), hourlyRate: round2(hourlyRate),
  };
}

/** Project/remote fixed fee — attendance never changes the amount. */
export function computeFixedFeeSalary(i: FixedFeeSalaryInput): SalaryBreakdown {
  const gross = round2(i.monthlyFee);
  const net = round2(gross - i.tdsMonthly - i.advances + i.pendingBalanceIn);
  return {
    monthlyCtc: 0, perDay: 0, payableDays: 0, lateDeductionDays: 0, effectiveDays: 0,
    gross, pt: 0, tds: i.tdsMonthly, advances: i.advances, pendingBalanceIn: i.pendingBalanceIn, net,
    basis: "fixed_fee", fee: gross,
  };
}
