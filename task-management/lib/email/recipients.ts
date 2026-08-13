/**
 * Which addresses one employee's own documents go to.
 *
 * An employee has up to three on file — the login `email`, an `officialEmail`
 * (work) and a `personalEmail` — and they are frequently different. Sending a
 * payslip or an attendance statement to only the login address means the person
 * who reads their work mailbox never sees it, so anything addressed to an
 * employee about THEMSELVES goes to all of them.
 *
 * DEDUPED case-insensitively, because the same address is routinely stored in
 * two of the three columns and nobody wants the same payslip twice.
 *
 * SCOPE: this resolves the addresses for ONE employee from that employee's own
 * record. It never mixes people, which is what keeps "employee A can never
 * receive employee B's payment information" true by construction — the caller
 * has one profile in hand and gets back only that profile's addresses.
 */
export function employeeEmailTargets(emp: {
  email?: string | null;
  officialEmail?: string | null;
  personalEmail?: string | null;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // Login address first: it is the one guaranteed to exist and to be unique, so
  // it stays the primary `to` and the others read as additional copies.
  for (const raw of [emp.email, emp.officialEmail, emp.personalEmail]) {
    const addr = raw?.trim();
    if (!addr) continue;
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}
