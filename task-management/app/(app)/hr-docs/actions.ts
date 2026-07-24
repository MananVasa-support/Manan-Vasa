"use server";

/**
 * HR Letters / Documents — the PUBLIC server-action surface. Intentionally TINY:
 * every function is a one-line wrapper delegating to lib/hr-docs/actions-core
 * (a plain server-only module that holds the real logic + all heavy imports).
 *
 * WHY: Next processes a "use server" file at the client↔server boundary whenever
 * a CLIENT component imports an action from it. A large action file (the old
 * 700-line version) makes webpack DEV HANG doing that. Keeping this file tiny
 * (like the working candidate-actions) fixes the hang while the logic lives in
 * the core module, which no client ever imports.
 */
import * as core from "@/lib/hr-docs/actions-core";

export type { TemplateRow, DocumentStatusRow } from "@/lib/hr-docs/actions-core";

export async function listTemplates(category?: string) {
  return core.listTemplates(category);
}
export async function getTemplate(typeKey: string) {
  return core.getTemplate(typeKey);
}
export async function saveTemplateBody(input: Parameters<typeof core.saveTemplateBody>[0]) {
  return core.saveTemplateBody(input);
}
export async function composeDocument(input: Parameters<typeof core.composeDocument>[0]) {
  return core.composeDocument(input);
}
export async function submitRequest(input: Parameters<typeof core.submitRequest>[0]) {
  return core.submitRequest(input);
}
export async function issueDocument(input: Parameters<typeof core.issueDocument>[0]) {
  return core.issueDocument(input);
}
export async function listEmployeeDocuments(employeeId: string) {
  return core.listEmployeeDocuments(employeeId);
}
export async function getDocumentStatus(instanceId: string) {
  return core.getDocumentStatus(instanceId);
}
