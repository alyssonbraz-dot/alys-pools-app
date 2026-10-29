import {validTimeZone} from '@/lib/service-time';
import { FieldApp } from "@/components/field/field-app";
import { requireOperator } from "@/lib/auth";
export default async function RoutePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; technician?: string;timezone?:string }>;
}) {
  const { date, technician,timezone } = await searchParams;
  const { user, profile,db } = await requireOperator();
  const {data:prefs}=await db.rpc('operator_preferences');
  return (
    <FieldApp initialTimeZone={timezone&&validTimeZone(timezone)?timezone:prefs?.timeZone}
      initialTechnician={profile.role === "technician" ? user.id : technician}
      expectedRole={profile.role}
      expectedScope={{
        userId: user.id,
        organizationId: profile.organization_id,
      }}
      initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
    />
  );
}
