"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { fireToast } from "@/lib/toast";
import { editEmployee } from "@/app/(admin)/admin/employees/actions";
import {
  DepartmentMultiSelect,
  type DepartmentOption,
} from "@/components/admin/department-multi-select";

type Role = "doer" | "initiator" | "both";

export interface EmployeeDepartmentMembership {
  id: string;
  name: string;
  isPrimary: boolean;
}

export interface EditEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: {
    id: string;
    name: string;
    email: string;
    role: Role;
    departments: EmployeeDepartmentMembership[];
    isAdmin: boolean;
    whatsappPhone: string | null;
    whatsappOptedIn: boolean;
    managerId?: string | null;
  };
  isSelf: boolean;
  departmentOptions: DepartmentOption[];
  managerOptions: { value: string; label: string }[];
}

/** Compare two id lists as sets (order-independent). */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

export function EditEmployeeDialog({
  open,
  onOpenChange,
  employee,
  isSelf,
  departmentOptions,
  managerOptions,
}: EditEmployeeDialogProps) {
  const initialDeptIds = employee.departments.map((d) => d.id);
  const initialPrimaryId =
    employee.departments.find((d) => d.isPrimary)?.id ??
    employee.departments[0]?.id ??
    null;

  const [name, setName]         = useState(employee.name);
  const [role, setRole]         = useState<Role>(employee.role);
  const [deptIds, setDeptIds]   = useState<string[]>(initialDeptIds);
  const [primaryId, setPrimaryId] = useState<string | null>(initialPrimaryId);
  const [isAdmin, setIsAdmin]   = useState(employee.isAdmin);
  const [managerId, setManagerId] = useState<string | null>(employee.managerId ?? null);
  const [waPhone, setWaPhone]   = useState(employee.whatsappPhone ?? "");
  const [waOptIn, setWaOptIn]   = useState(employee.whatsappOptedIn);
  const [error, setError]       = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-sync local state whenever the dialog opens for a (possibly different)
  // employee — otherwise stale values bleed across rows.
  useEffect(() => {
    if (open) {
      setName(employee.name);
      setRole(employee.role);
      setDeptIds(employee.departments.map((d) => d.id));
      setPrimaryId(
        employee.departments.find((d) => d.isPrimary)?.id ??
          employee.departments[0]?.id ??
          null,
      );
      setIsAdmin(employee.isAdmin);
      setManagerId(employee.managerId ?? null);
      setWaPhone(employee.whatsappPhone ?? "");
      setWaOptIn(employee.whatsappOptedIn);
      setError(null);
    }
    // employee.departments is a fresh array per render; key on id only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    employee.id,
    employee.name,
    employee.role,
    employee.isAdmin,
    employee.managerId,
    employee.whatsappPhone,
    employee.whatsappOptedIn,
  ]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Build a sparse patch — only changed fields.
    const patch: {
      name?: string;
      role?: Role;
      departmentIds?: string[];
      primaryDepartmentId?: string | null;
      isAdmin?: boolean;
      managerId?: string | null;
      whatsappPhone?: string | null;
      whatsappOptedIn?: boolean;
    } = {};
    const trimmedName = name.trim();
    const trimmedWaPhone = waPhone.trim();
    const currentWaPhone = employee.whatsappPhone ?? "";

    if (trimmedName !== employee.name) patch.name = trimmedName;
    if (role !== employee.role) patch.role = role;
    if (!sameSet(deptIds, initialDeptIds) || primaryId !== initialPrimaryId) {
      patch.departmentIds = deptIds;
      patch.primaryDepartmentId = primaryId;
    }
    if (isAdmin !== employee.isAdmin) patch.isAdmin = isAdmin;
    if (managerId !== (employee.managerId ?? null)) patch.managerId = managerId;
    if (trimmedWaPhone !== currentWaPhone) {
      patch.whatsappPhone = trimmedWaPhone === "" ? null : trimmedWaPhone;
    }
    if (waOptIn !== employee.whatsappOptedIn) {
      patch.whatsappOptedIn = waOptIn;
    }

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await editEmployee(employee.id, patch);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${trimmedName || employee.name} updated.` });
      onOpenChange(false);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Edit employee
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            {employee.email}
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Full name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </Field>
            <Field label="Task role">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white"
              >
                <option value="doer">Doer</option>
                <option value="initiator">Initiator</option>
                <option value="both">Both</option>
              </select>
            </Field>
            <Field label="Manager">
              <select
                value={managerId ?? ""}
                onChange={(e) => setManagerId(e.target.value || null)}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white"
              >
                <option value="">— None —</option>
                {managerOptions
                  .filter((o) => o.value !== employee.id)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Departments (optional)">
              <DepartmentMultiSelect
                options={departmentOptions}
                selectedIds={deptIds}
                primaryId={primaryId}
                onChange={(ids, primary) => {
                  setDeptIds(ids);
                  setPrimaryId(primary);
                }}
              />
            </Field>
            <Field label="WhatsApp phone (E.164, optional)">
              <input
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="+919820062511"
                maxLength={20}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </Field>
            <label className="flex items-start gap-2.5 text-[15px] text-[#334155]" style={{ lineHeight: 1.5 }}>
              <input
                type="checkbox"
                checked={waOptIn}
                onChange={(e) => setWaOptIn(e.target.checked)}
                className="mt-1.5 h-4 w-4"
              />
              <span>
                <span className="font-semibold text-[#0F172A]">
                  I have this employee&apos;s consent to send WhatsApp notifications
                </span>
                <span className="block text-[13px] text-[#64748B] mt-0.5">
                  Required by Meta + DPDP — leave off if the employee hasn&apos;t agreed.
                </span>
              </span>
            </label>
            <label
              className={`flex items-center gap-2.5 text-[15px] text-[#334155] ${
                isSelf ? "opacity-60 cursor-not-allowed" : ""
              }`}
              title={isSelf ? "You can't remove your own admin role." : undefined}
            >
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                disabled={isSelf}
                className="h-4 w-4"
              />
              Admin (can manage employees + settings)
            </label>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                  disabled={pending}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">{label}</label>
      {children}
    </div>
  );
}
