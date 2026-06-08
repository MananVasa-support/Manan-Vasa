"use client";

export interface ToastDetail {
  id: string;
  message: string;
  actionLabel?: string;
  // The action is stored by id on the host's internal map (functions don't cross CustomEvent boundaries reliably).
}

const HANDLERS = new Map<string, () => void | Promise<void>>();
const TOAST_EVENT = "vp-toast";

export function fireToast(opts: {
  message: string;
  actionLabel?: string;
  action?: () => void | Promise<void>;
}): void {
  const id = crypto.randomUUID();
  if (opts.action) HANDLERS.set(id, opts.action);
  const detail: ToastDetail = {
    id,
    message: opts.message,
    actionLabel: opts.actionLabel,
  };
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
}

export function consumeHandler(id: string): (() => void | Promise<void>) | undefined {
  const fn = HANDLERS.get(id);
  HANDLERS.delete(id);
  return fn;
}

export const TOAST_EVENT_NAME = TOAST_EVENT;
