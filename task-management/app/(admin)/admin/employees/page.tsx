import { desc } from "drizzle-orm";
import { Download, Users } from "lucide-react";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import {
  listActiveDepartments,
  getEmployeeDepartmentMap,
} from "@/lib/queries/departments";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { EmployeeList } from "@/components/admin/employee-list";
import { InviteEmployeeDialog } from "@/components/admin/invite-employee-dialog";
import type { EmployeeDepartmentMembership } from "@/components/admin/edit-employee-dialog";

export default async function EmployeesPage() {
  const me = await requireAdmin();
  const [all, activeDepartments, departmentMap] = await Promise.all([
    db.select().from(employees).orderBy(desc(employees.createdAt)),
    listActiveDepartments(),
    getEmployeeDepartmentMap(),
  ]);
  const departmentOptions = activeDepartments.map((d) => ({
    id: d.id,
    name: d.name,
  }));
  const managerOptions = all.map((e) => ({ value: e.id, label: e.name }));
  const membershipsByEmployee: Record<string, EmployeeDepartmentMembership[]> =
    Object.fromEntries(departmentMap);
  const activeCount = all.filter((e) => e.isActive).length;
  const invitedCount = all.filter((e) => e.isActive && !e.joinedAt).length;
  // Only super-admins may change an employee's admin status; non-super-admins
  // get the admin toggle hidden in the create + edit dialogs. The server
  // guards in actions.ts are the real boundary — this is UX, not security.
  const canManageAdmins = isSuperAdmin(me.email);

  return (
    <AdminSection
      eyebrow="Admin · Employees"
      title="The team"
      subtitle={`${all.length} total · ${activeCount} active · ${invitedCount} pending invite`}
      icon={Users}
      stats={[
        { label: "Total", value: all.length },
        { label: "Active", value: activeCount, tone: "green" },
        { label: "Pending invite", value: invitedCount, tone: "amber" },
      ]}
      actions={
        <>
          <a
            href="/admin/employees/export"
            download
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink-strong transition-colors px-3.5 py-2 rounded-pill border border-hairline bg-surface-card wg-btn"
            style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
            title="Download current view as CSV"
            aria-label="Export CSV"
          >
            <Download size={14} strokeWidth={2.2} />
            Export CSV
          </a>
          <InviteEmployeeDialog
            departmentOptions={departmentOptions}
            canManageAdmins={canManageAdmins}
          />
        </>
      }
    >
      <EmployeeList
        employees={all}
        membershipsByEmployee={membershipsByEmployee}
        currentEmployeeId={me.id}
        canManageAdmins={canManageAdmins}
        departmentOptions={departmentOptions}
        managerOptions={managerOptions}
      />
    </AdminSection>
  );
}
