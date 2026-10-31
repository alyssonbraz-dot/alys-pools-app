import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { FinanceApp } from "@/components/finance/finance-app";
export default async function PoolProfitability({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireOperator();
  if (profile.role !== "owner") redirect("/stops");
  const { id } = await params;
  return <FinanceApp screen="pool" poolId={id} />;
}
