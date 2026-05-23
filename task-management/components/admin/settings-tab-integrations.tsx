import type { IntegrationStatus } from "@/lib/queries/integration-health";
import { IntegrationCard } from "./integration-card";

export function SettingsTabIntegrations({
  rows,
}: {
  rows: IntegrationStatus[];
}) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-display-xs mb-2">Integrations</h2>
      <p className="text-body text-ink-subtle mb-6">
        Connection state and recent delivery counts for each channel. Use the
        test button to send yourself a real notification through each one.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <IntegrationCard key={r.channel} status={r} />
        ))}
      </div>
    </div>
  );
}
