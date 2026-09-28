import { InstitutionSettings } from "@/components/settings/institution-settings";
import { IntegrationSettings } from "@/components/settings/integration-settings";

export default function InstitutionSettingsPage() {
  return (
    <div className="grid gap-8">
      <InstitutionSettings />
      <IntegrationSettings />
    </div>
  );
}
