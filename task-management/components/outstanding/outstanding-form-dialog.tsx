"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import {
  createOutstandingContract,
  uploadOutstandingAttachment,
} from "@/app/(app)/outstanding/actions";
import {
  OUTSTANDING_CYCLES,
  OUTSTANDING_CYCLE_LABELS,
  GST_RATES,
} from "@/db/enums";
import { AttachmentField } from "./attachment-field";

// Live total wants paise precision (an 18% GST total is rarely round), so use a
// local 2-dp formatter rather than lib/format's whole-rupee formatInr.
const totalFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const GST_OPTIONS = GST_RATES.map((r) => ({
  value: String(r),
  label: r === 0 ? "0 — No GST" : `${r}%`,
}));

const CYCLE_OPTIONS = OUTSTANDING_CYCLES.map((c) => ({
  value: c,
  label: OUTSTANDING_CYCLE_LABELS[c],
}));

const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export function OutstandingFormDialog({
  clients,
  employees,
  products,
  entities,
  modes,
  trigger,
}: {
  clients: string[];
  employees: { id: string; name: string }[];
  products: { id: string; name: string }[];
  entities: { id: string; name: string }[];
  modes: { id: string; name: string }[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [clientName, setClientName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [productId, setProductId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("18");
  const [cycle, setCycle] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [periods, setPeriods] = useState("");
  const [entityId, setEntityId] = useState("");
  const [modeId, setModeId] = useState("");
  const [pdc, setPdc] = useState(""); // "yes" | "no"
  const [comments, setComments] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const isFullPayment = cycle === "full_payment";

  const total = useMemo(() => {
    const a = Number(amount);
    const g = Number(gst);
    if (!Number.isFinite(a) || a <= 0) return null;
    return a * (1 + (Number.isFinite(g) ? g : 0) / 100);
  }, [amount, gst]);

  function reset() {
    setClientName("");
    setContactPhone("");
    setProductId("");
    setResponsibleId("");
    setAmount("");
    setGst("18");
    setCycle("");
    setStartDate("");
    setPeriods("");
    setEntityId("");
    setModeId("");
    setPdc("");
    setComments("");
    setFile(null);
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientName) return setError("Pick a client.");
    if (!productId) return setError("Pick a product.");
    if (!responsibleId) return setError("Pick a responsible person.");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter a valid amount.");
    if (!cycle) return setError("Pick a payment cycle.");
    if (!startDate) return setError("Pick a date.");
    if (!entityId) return setError("Pick an entity.");
    if (!modeId) return setError("Pick a payment mode.");
    if (!pdc) return setError("Select whether a PDC was received.");

    const input = {
      clientName,
      contactPhone: contactPhone.trim() || undefined,
      productId,
      entityId,
      responsibleId,
      expectedModeId: modeId,
      cycle: cycle as (typeof OUTSTANDING_CYCLES)[number],
      baseAmount: amt,
      gstRate: Number(gst),
      startDate,
      periods: isFullPayment ? undefined : periods.trim() ? Number(periods) : null,
      pdcReceived: pdc === "yes",
      comments: comments.trim() || undefined,
    };

    startTransition(async () => {
      const res = await createOutstandingContract(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (file) {
        const fd = new FormData();
        fd.set("ownerType", "contract");
        fd.set("ownerId", res.id);
        fd.set("file", file);
        const up = await uploadOutstandingAttachment(fd);
        if (!up.ok) {
          fireToast({
            message: `Contract saved, but the attachment failed: ${up.error}`,
            type: "error",
          });
        }
      }
      fireToast({ message: "Outstanding contract created." });
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger asChild>
        {trigger ?? (
          <button
            className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            + Outstanding
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            New outstanding contract
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            Record a receivable. The payment schedule is generated automatically
            from the cycle, amount and start date.
          </Dialog.Description>

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Client */}
            <Section title="Client">
              <Field label="Client" required>
                <Select
                  options={clients.map((c) => ({ value: c, label: c }))}
                  value={clientName}
                  onValueChange={setClientName}
                  placeholder="— Select client —"
                  searchable
                  ariaLabel="Client"
                />
              </Field>
              <Field label="Contact phone">
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Optional"
                  maxLength={40}
                  className={INPUT_CLASS}
                />
              </Field>
            </Section>

            {/* Product */}
            <Section title="Product">
              <Field label="Product" required>
                <Select
                  options={products.map((p) => ({ value: p.id, label: p.name }))}
                  value={productId}
                  onValueChange={setProductId}
                  placeholder="— Select product —"
                  ariaLabel="Product"
                />
              </Field>
            </Section>

            {/* Responsible */}
            <Section title="Responsible Person">
              <Field label="Responsible person" required>
                <Select
                  options={employees.map((e) => ({ value: e.id, label: e.name }))}
                  value={responsibleId}
                  onValueChange={setResponsibleId}
                  placeholder="— Select person —"
                  searchable
                  ariaLabel="Responsible person"
                />
              </Field>
            </Section>

            {/* Amount & GST */}
            <Section title="Amount & GST">
              <Field label="Amount (₹)" required>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="GST" required>
                <Select
                  options={GST_OPTIONS}
                  value={gst}
                  onValueChange={setGst}
                  placeholder="— Select GST —"
                  ariaLabel="GST rate"
                />
              </Field>
              <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 flex items-center justify-between">
                <span className="text-[14px] font-semibold text-[#0F172A]">Total</span>
                <span className="text-[15px] font-semibold text-[#0F172A]">
                  {total === null ? "—" : totalFmt.format(total)}
                </span>
              </div>
            </Section>

            {/* Payment cycle */}
            <Section title="Payment Cycle">
              <Field label="Cycle" required>
                <Select
                  options={CYCLE_OPTIONS}
                  value={cycle}
                  onValueChange={setCycle}
                  placeholder="— Select cycle —"
                  ariaLabel="Payment cycle"
                />
              </Field>
              {cycle && (
                <Field label={isFullPayment ? "Date" : "Start date"} required>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </Field>
              )}
              {cycle && !isFullPayment && (
                <Field label="# of months (periods)">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={periods}
                    onChange={(e) => setPeriods(e.target.value)}
                    placeholder="Leave blank for open-ended"
                    className={INPUT_CLASS}
                  />
                </Field>
              )}
            </Section>

            {/* Payment details */}
            <Section title="Payment Details">
              <Field label="Entity" required>
                <Select
                  options={entities.map((en) => ({ value: en.id, label: en.name }))}
                  value={entityId}
                  onValueChange={setEntityId}
                  placeholder="— Select entity —"
                  ariaLabel="Entity"
                />
              </Field>
              <Field label="Payment mode" required>
                <Select
                  options={modes.map((m) => ({ value: m.id, label: m.name }))}
                  value={modeId}
                  onValueChange={setModeId}
                  placeholder="— Select mode —"
                  ariaLabel="Payment mode"
                />
              </Field>
              <Field label="PDC received" required>
                <Select
                  options={YES_NO_OPTIONS}
                  value={pdc}
                  onValueChange={setPdc}
                  placeholder="— Select —"
                  ariaLabel="PDC received"
                />
              </Field>
            </Section>

            {/* Additional */}
            <Section title="Additional">
              <Field label="Comments">
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Optional notes"
                  maxLength={1000}
                  rows={3}
                  className={INPUT_CLASS}
                />
              </Field>
              <AttachmentField file={file} onChange={setFile} />
            </Section>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
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
                {pending ? "Saving…" : "Create contract"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-[13px] font-semibold uppercase tracking-wide text-[#64748B]">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
        {required && <span className="text-[#E10600] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
