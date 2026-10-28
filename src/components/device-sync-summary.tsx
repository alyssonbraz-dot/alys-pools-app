"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getActiveScope,
  getQueue,
  type OfflineScope,
} from "@/lib/offline/store";
import { T } from "./i18n";
export function DeviceSyncSummary({ scope }: { scope: OfflineScope }) {
  const [counts, setCounts] = useState<{
    pending: number;
    failed: number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    async function read() {
      const identity = await getActiveScope();
      if (
        identity?.userId !== scope.userId ||
        identity.organizationId !== scope.organizationId
      ) {
        if (active) setCounts({ pending: 0, failed: 0 });
        return;
      }
      const queue = await getQueue(scope);
      if (active)
        setCounts({
          pending: queue.length,
          failed: queue.filter((q) => q.status !== "pending").length,
        });
    }
    void read().catch(() => {});
    const timer = setInterval(() => void read().catch(() => {}), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [scope.userId, scope.organizationId, scope]);
  return (
    <p className="device-sync">
      <T text="This device" />:{" "}
      {counts
        ? `${counts.pending} pending sync · ${counts.failed} failed / sign-in required`
        : "Checking local storage…"}{" "}
      ·{" "}
      <Link href="/stops">
        <T text="Open Stops to synchronize" />
      </Link>
      <span className="note">
        {" "}
        · <T text="Server cannot see work still stored on other devices." />
      </span>
    </p>
  );
}
