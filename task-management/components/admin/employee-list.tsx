"use client";

import { Star } from "lucide-react";
import type { Employee } from "@/db/schema";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { DataTable } from "@/components/admin/ui/data-table";
import { EmployeeRowActions } from "@/components/admin/employee-row-actions";
import type { EmployeeDepartmentMembership } from "@/components/admin/edit-employee-dialog";
import type { DepartmentOption } from "@/components/admin/department-multi-select";

interface Props {
  employees: Employee[];
  /** employeeId → the departments they belong to (primary flagged). */
  membershipsByEmployee: Record<string, EmployeeDepartmentMembership[]>;
  currentEmployeeId: string;
  /** True only for super-admins (Hetesh / Manan) — gates the admin toggle. */
  canManageAdmins: boolean;
  departmentOptions: DepartmentOption[];
  managerOptions: { value: string; label: string }[];
}

function DepartmentCell({
  memberships,
}: {
  memberships: EmployeeDepartmentMembership[];
}) {
  if (memberships.length === 0) {
    return <span className="text-ink-subtle">—</span>;
  }
  const ordered = [...memberships].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name),
  );
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {ordered.map((m) => (
        <span
          key={m.id}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset"
          style={{
            background: m.isPrimary ? "#FEF2F2" : "#F1F5F9",
            color: m.isPrimary ? "#A80400" : "#334155",
            boxShadow: `inset 0 0 0 1px ${m.isPrimary ? "#FECACA" : "#CBD5E1"}`,
          }}
        >
          {m.isPrimary && <Star size={11} strokeWidth={2.4} fill="#A80400" />}
          {m.name}
        </span>
      ))}
    </span>
  );
}

const ROLE_CHIP: Record<
  "doer" | "initiator" | "both",
  { bg: string; fg: string; ring: string; label: string }
> = {
  doer:      { bg: "#EFF6FF", fg: "#1D4ED8", ring: "#BFDBFE", label: "Doer" },
  initiator: { bg: "#F5F3FF", fg: "#6D28D9", ring: "#DDD6FE", label: "Initiator" },
  both:      { bg: "#F1F5F9", fg: "#334155", ring: "#CBD5E1", label: "Both" },
};

function RoleChip({ role }: { role: "doer" | "initiator" | "both" }) {
  const c = ROLE_CHIP[role];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset"
      style={{ background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1px ${c.ring}` }}
    >
      {c.label}
    </span>
  );
}

export function EmployeeList({
  employees,
  membershipsByEmployee,
  currentEmployeeId,
  canManageAdmins,
  departmentOptions,
  managerOptions,
}: Props) {
  const deptNames = (e: Employee) =>
    (membershipsByEmployee[e.id] ?? []).map((m) => m.name).join(" ");

  return (
    <DataTable<Employee>
      rows={employees}
      getRowKey={(e) => e.id}
      searchText={(e) => `${e.name} ${e.email} ${deptNames(e)}`}
      searchPlaceholder="Search by name, email, or department"
      initialSort={{ key: "name", dir: "asc" }}
      filters={[
        {
          label: "Role",
          options: [
            { value: "doer", label: "Doer" },
            { value: "initiator", label: "Initiator" },
            { value: "both", label: "Both" },
          ],
          match: (e, v) => e.role === v,
        },
        {
          label: "Department",
          options: departmentOptions.map((d) => ({
            value: d.id,
            label: d.name,
          })),
          match: (e, v) =>
            (membershipsByEmployee[e.id] ?? []).some((m) => m.id === v),
        },
      ]}
      columns={[
        {
          key: "name",
          label: "Name",
          sortValue: (e) => e.name,
          render: (e) => (
            <div className="flex items-center gap-3 min-w-0">
              <EmployeeAvatar name={e.name} size="md" />
              <span
                className="text-ink-strong font-semibold truncate max-w-[22ch]"
                title={e.name}
              >
                {e.name}
              </span>
            </div>
          ),
        },
        {
          key: "email",
          label: "Email",
          sortValue: (e) => e.email,
          render: (e) => (
            <span className="text-ink-soft truncate max-w-[30ch] inline-block align-middle" title={e.email}>
              {e.email}
            </span>
          ),
        },
        {
          key: "role",
          label: "Role",
          sortValue: (e) => e.role,
          render: (e) => <RoleChip role={e.role} />,
        },
        {
          key: "department",
          label: "Department",
          render: (e) => (
            <DepartmentCell memberships={membershipsByEmployee[e.id] ?? []} />
          ),
        },
      ]}
      rowActions={(e) => (
        <EmployeeRowActions
          employee={{
            id: e.id,
            name: e.name,
            email: e.email,
            role: e.role,
            departments: membershipsByEmployee[e.id] ?? [],
            isAdmin: e.isAdmin,
            isActive: e.isActive,
            joinedAt: e.joinedAt,
            whatsappPhone: e.whatsappPhone,
            whatsappOptedIn: e.whatsappOptedIn,
            managerId: e.managerId,
            dailyTaskQuota: e.dailyTaskQuota,
            attendanceBiometricExempt: e.attendanceBiometricExempt,
            weeklyOff: e.weeklyOff,
            attOfficialStart: e.attOfficialStart,
            attLateAfter: e.attLateAfter,
            attOfficialEnd: e.attOfficialEnd,
            attEarlyBefore: e.attEarlyBefore,
          }}
          isSelf={e.id === currentEmployeeId}
          canManageAdmins={canManageAdmins}
          departmentOptions={departmentOptions}
          managerOptions={managerOptions}
        />
      )}
      emptyState={
        <>
          <p
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-serif), system-ui, sans-serif",
              fontStyle: "italic",
              fontSize: 22,
              letterSpacing: "-0.015em",
            }}
          >
            No employees yet
          </p>
          <p className="mt-2 text-[14px] text-ink-subtle max-w-sm mx-auto" style={{ lineHeight: 1.5 }}>
            Invite your first teammate with the button above — they&apos;ll get a
            signed link to set their password.
          </p>
        </>
      }
    />
  );
}
