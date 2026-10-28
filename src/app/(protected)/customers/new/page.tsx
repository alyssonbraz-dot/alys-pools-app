import { requireManager } from "@/lib/auth";
import { defaultsSchema } from "@/lib/company-settings";
import { CustomerOnboarding } from "@/components/customer-onboarding";
export default async function NewCustomer() {
  const { db, user, profile } = await requireManager();
  const { data } = await db
    .from("profiles")
    .select("id,display_name")
    .in("role", ["owner", "admin", "technician"]);
  const { data: company } = await db
    .from("organizations")
    .select("settings")
    .eq("id", profile.organization_id)
    .single();
  return (
    <CustomerOnboarding
      defaults={defaultsSchema.parse(company?.settings?.service_defaults ?? {})}
      ownerId={user.id}
      technicians={data ?? []}
    />
  );
}
