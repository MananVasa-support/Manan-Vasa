import { requireWorkspace } from "@/lib/auth/workspace-access";
import { IntakeFormLauncher } from "@/components/hr/candidate/intake-form-launcher";

export const dynamic = "force-dynamic";

/**
 * Pre-Interview → Basic Details opens HERE: the Candidate Interview Form, direct,
 * on its own full-screen plain page (no rail, no app header — chrome-shell hides
 * the rail on /hr/intake; the wizard is a fixed full-screen surface).
 */
export default async function IntakePage() {
  await requireWorkspace("hr");
  return <IntakeFormLauncher />;
}
