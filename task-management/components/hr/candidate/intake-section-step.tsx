"use client";

import * as React from "react";
import { Plus, X, UploadCloud } from "lucide-react";
import { Field, FieldInput } from "@/components/forms/form-fields";
import { vkey, type IntakeSection } from "@/lib/hr/candidate/intake-schema";

const DISPLAY_FONT = "var(--font-display), system-ui, sans-serif";

export function IntakeSectionStep({
  section,
  values,
  set,
  instances,
  onAdd,
  onRemove,
  photo,
  sign,
  onUpload,
  invalid,
}: {
  section: IntakeSection;
  values: Record<string, string>;
  set: (k: string, v: string) => void;
  instances: string[];
  onAdd: () => void;
  onRemove: (uid: string) => void;
  photo: { path?: string; preview?: string; busy?: boolean };
  sign: { path?: string; preview?: string; busy?: boolean };
  onUpload: (kind: "photo" | "signature", f: File) => void;
  invalid: Set<string>;
}) {
  const RequiredMsg = () => (
    <p className="mt-1.5 text-[12px] font-semibold text-altus-red">This field is required.</p>
  );

  return (
    <div>
      {/* Section heading */}
      <h3
        className="text-ink-strong"
        style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1.1 }}
      >
        {section.title}
      </h3>
      {section.subtitle && (
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{section.subtitle}</p>
      )}

      {/* Declaration file tiles */}
      {section.declaration && (
        <div className="iw-fields mt-8 grid grid-cols-2 gap-x-6 gap-y-5 max-sm:grid-cols-1">
          <FileTile
            label="Passport-size Photograph"
            required
            state={photo}
            onPick={(f) => onUpload("photo", f)}
            accept="image/*"
            error={invalid.has(`${section.id}.__photo__`)}
          />
          <FileTile
            label="Candidate's Signature"
            required
            state={sign}
            onPick={(f) => onUpload("signature", f)}
            accept="image/*"
            error={invalid.has(`${section.id}.__sign__`)}
          />
        </div>
      )}

      {/* Repeater sections */}
      {section.repeat ? (
        <div className="mt-8 space-y-5">
          {instances.map((uid, idx) => (
            <div
              key={uid}
              className="iw-row overflow-hidden rounded-2xl border border-hairline bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] max-sm:p-5"
            >
              <div className="mb-5 flex items-center justify-between border-b border-hairline pb-3">
                <span className="inline-flex items-center gap-2.5">
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-black text-white"
                    style={{ background: "var(--color-altus-red)" }}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-[14px] font-bold uppercase tracking-wide text-ink-soft">
                    {section.repeat!.itemLabel} {idx + 1}
                  </span>
                </span>
                {instances.length > section.repeat!.min && (
                  <button
                    onClick={() => onRemove(uid)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-altus-red/10 hover:text-altus-red"
                    aria-label="Remove"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="iw-fields grid grid-cols-2 gap-x-6 gap-y-5 max-sm:grid-cols-1">
                {section.fields.map((f) => {
                  const k = `${section.id}.${uid}.${f.key}`;
                  const err = invalid.has(k);
                  return (
                    <div
                      key={f.key}
                      data-invalid={err ? "true" : undefined}
                      className={`${f.type === "textarea" ? "col-span-2 max-sm:col-span-1" : ""} ${err ? "rounded-lg ring-1 ring-altus-red/40 -m-1 p-1" : ""}`}
                    >
                      <Field label={f.label} required={f.required}>
                        <FieldInput field={f} value={values[k] ?? ""} onChange={(_, v) => set(k, v)} />
                      </Field>
                      {err && <RequiredMsg />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {section.repeat.max > instances.length && (
            <button
              onClick={onAdd}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hairline-strong py-4 text-[14px] font-bold text-ink-muted transition-colors hover:border-altus-red hover:text-altus-red"
            >
              <Plus size={17} /> Add another {section.repeat.itemLabel.toLowerCase()}
            </button>
          )}
        </div>
      ) : (
        <div className="iw-fields mt-8 grid grid-cols-2 gap-x-6 gap-y-5 max-sm:grid-cols-1">
          {section.fields.map((f, i) => {
            const k = vkey(section.id, f.key);
            const err = invalid.has(k);
            return (
              <div
                key={f.key}
                data-invalid={err ? "true" : undefined}
                className={`${f.type === "textarea" ? "col-span-2 max-sm:col-span-1" : ""} ${err ? "rounded-lg ring-1 ring-altus-red/40 -m-1 p-1" : ""}`}
              >
                <Field label={f.label} required={f.required}>
                  <div {...(i === 0 ? { "data-autofocus": true } : {})}>
                    <FieldInput field={f} value={values[k] ?? ""} onChange={(_, v) => set(k, v)} />
                  </div>
                </Field>
                {err && <RequiredMsg />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FileTile({
  label,
  required,
  state,
  onPick,
  accept,
  error,
}: {
  label: string;
  required?: boolean;
  state: { path?: string; preview?: string; busy?: boolean };
  onPick: (f: File) => void;
  accept: string;
  error?: boolean;
}) {
  const id = React.useId();
  return (
    <div data-invalid={error ? "true" : undefined}>
      <label className="mb-2 block text-[15px] font-bold text-ink-strong">
        {label}
        {required && <span className="ml-0.5 text-altus-red">*</span>}
      </label>
      <label
        htmlFor={id}
        className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2.5 overflow-hidden rounded-2xl border-2 border-dashed bg-white transition-colors hover:border-altus-red"
        style={{ borderColor: error ? "var(--color-altus-red)" : "var(--color-hairline-strong)" }}
      >
        {state.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.preview} alt="" className="h-full w-full object-contain" />
        ) : (
          <>
            <span
              className="grid h-12 w-12 place-items-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, white)" }}
            >
              <UploadCloud size={24} className="text-altus-red" />
            </span>
            <span className="text-[13px] font-semibold text-ink-muted">Click to upload</span>
          </>
        )}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
      <p
        className="mt-1.5 text-[12px] font-semibold"
        style={{ color: state.busy ? "var(--color-ink-subtle)" : state.path ? "#16a34a" : error ? "var(--color-altus-red)" : "var(--color-ink-subtle)" }}
      >
        {state.busy ? "Uploading…" : state.path ? "Uploaded ✓" : error ? "Required" : "PNG / JPG, up to 8 MB"}
      </p>
    </div>
  );
}
