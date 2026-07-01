import { Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listSalaryProfiles } from "@/lib/queries/salary";
import {
  listDesignationsWithCounts,
  listPayingEntitiesWithCounts,
} from "@/lib/queries/outstanding-rosters";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { SalaryProfileList } from "@/components/admin/salary-profile-list";
import { SalaryProfileImportDialog } from "@/components/admin/salary-profile-import-dialog";

export const dynamic = "force-dynamic";

export default async function SalaryProfilesPage() {
  await requireAdmin();

  const [rows, designations, entities] = await Promise.all([
    listSalaryProfiles(),
    listDesignationsWithCounts(),
    listPayingEntitiesWithCounts(),
  ]);

  // Only active roster items are offered in the pickers.
  const designationOptions = designations
    .filter((d) => d.isActive)
    .map((d) => ({ id: d.id, name: d.name }));
  const entityOptions = entities
    .filter((e) => e.isActive)
    .map((e) => ({ id: e.id, name: e.name }));

  const withCtc = rows.filter((r) => r.annualCtc > 0).length;

  return (
    <AdminSection
      eyebrow="Admin · Salary"
      title="Salary Profiles"
      subtitle={`${rows.length} active employees · ${withCtc} with a CTC set · Set each person's CTC, TDS, PT-exemption, designation, paying entity and probation, and record monthly advances.`}
      icon={Wallet}
      stats={[
        { label: "Active employees", value: rows.length },
        { label: "With CTC set", value: withCtc, tone: "green" },
      ]}
      actions={<SalaryProfileImportDialog />}
    >
      <SalaryProfileList
        rows={rows}
        designations={designationOptions}
        entities={entityOptions}
      />
    </AdminSection>
  );
}
