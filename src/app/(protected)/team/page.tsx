import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { TeamManager } from "@/components/team-manager";
export default async function Team() {
  const { profile } = await requireOperator();
  if (profile.role !== "owner") redirect("/stops");
  return <TeamManager />;
}
