// Worker-type resolver — maps an employee's `worker_type` to its PAY BASIS
// (how salary is computed) and GRADING MODE (how attendance is measured). This
// is the single branch point the salary engine and the grader read, so the
// mapping lives in exactly one place. See db/enums.ts for the unions.

import {
  type WorkerType,
  type PayBasis,
  type GradingMode,
  WORKER_TYPES,
} from "@/db/enums";

export type { WorkerType, PayBasis, GradingMode };
export { WORKER_TYPES };

/** Human labels for pickers / badges. */
export const WORKER_TYPE_LABELS: Record<WorkerType, string> = {
  full_time: "Full-Time",
  afternoon_shift: "Afternoon / College Shift",
  part_time: "Part-Time (Hourly)",
  project_remote: "Project / Remote",
};

/** part-time → hourly, project → fixed fee, everything else → monthly CTC. */
export function payBasisFor(w: WorkerType): PayBasis {
  return w === "part_time" ? "hourly" : w === "project_remote" ? "fixed_fee" : "monthly_ctc";
}

/** part-time → hours target, project → work sessions, else day grading. */
export function gradingModeFor(w: WorkerType): GradingMode {
  return w === "part_time" ? "hours" : w === "project_remote" ? "session" : "day";
}

/** Narrow an untrusted string to a WorkerType, defaulting to full_time. */
export function asWorkerType(v: string | null | undefined): WorkerType {
  return (WORKER_TYPES as readonly string[]).includes(v ?? "") ? (v as WorkerType) : "full_time";
}
