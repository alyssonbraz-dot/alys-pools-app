import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { FinanceApp } from "@/components/finance/finance-app";
export default async function Finance() {
  const { profile } = await requireOperator();
  if (profile.role !== "owner") redirect("/stops");
  return <FinanceApp screen="result" />;
}
