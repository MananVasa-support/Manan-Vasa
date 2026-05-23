"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { fireToast } from "@/lib/toast";
import { editEmployee } from "@/app/(admin)/admin/employees/actions";

type Role = "doer" | "initiator" | "both";

export interface EditEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: {
    id: string;
    name: string;
    email: string;
    role: Role;
    department: string | null;
    isAdmin: boolean;
    whatsappPhone: string | null;
    whatsappOptedIn: boolean;
  };
  isSelf: boolean;
  departmentOptions: string[];
}

export function EditEmployeeDialog({
  open,
  onOpenChange,
  employee,
  isSelf,
  departmentOptions,
}: EditEmployeeDialogProps) {
  const [name, setName]         = useState(employee.name);
  const [role, setRole]         = useState<Role>(employee.role);
  const [department, setDept]   = useState(employee.department ?? "");
  const [isAdmin, setIsAdmin]   = useState(employee.isAdmin);
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
      setDept(employee.department ?? "");
      setIsAdmin(employee.isAdmin);
      setWaPhone(employee.whatsappPhone ?? "");
      setWaOptIn(employee.whatsappOptedIn);
      setError(null);
    }
  }, [
    open,
    employee.id,
    employee.name,
    employee.role,
    employee.department,
    employee.isAdmin,
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
      department?: string | null;
      isAdmin?: boolean;
      whatsappPhone?: string | null;
      whatsappOptedIn?: boolean;
    } = {};
    const trimmedName = name.trim();
    const trimmedDept = department.trim();
    const currentDept = employee.department ?? "";
    const trimmedWaPhone = waPhone.trim();
    const currentWaPhone = employee.whatsappPhone ?? "";

    if (trimmedName !== employee.name) patch.name = trimmedName;
    if (role !== employee.role) patch.role = role;
    if (trimmedDept !== currentDept) {
      patch.department = trimmedDept === "" ? null : trimmedDept;
    }
    if (isAdmin !== employee.isAdmin) patch.isAdmin = isAdmin;
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
            <Field label="Department (optional)">
              {departmentOptions.length > 0 ? (
                <>
                  <input
                    value={department}
                    onChange={(e) => setDept(e.target.value)}
                    list="edit-departments-datalist"
                    maxLength={80}
                    placeholder="Type or pick from the list"
                    className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
                  />
                  <datalist id="edit-departments-datalist">
                    {departmentOptions.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </>
              ) : (
                <input
                  value={department}
                  onChange={(e) => setDept(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
                />
              )}
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
