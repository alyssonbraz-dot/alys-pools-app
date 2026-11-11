"use client";
import { useState } from "react";
import { useLanguage, T } from "@/components/i18n";
import { parseMoney } from "@/lib/finance/schema";
import { useBusiness, currentMonth, Money, type BusinessData } from "./ui";
export function PaymentRate({
  target,
  targetId,
  ownerLabor = false,
  data,
  onSaved,
  month = currentMonth(),
}: {
  target: "technician" | "customer";
  targetId: string;
  ownerLabor?: boolean;
  data: BusinessData;
  onSaved: () => void;
  month?: string;
}) {
  const { t } = useLanguage();
  const contract = data.contracts
    .filter(
      (c) =>
        c.customer_id === targetId &&
        c.source === "own" &&
        c.billing_model === "monthly" &&
        c.status === "active",
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  const scope = target === "technician" ? "technician" : "contract";
  const term = data.terms.find(
    (v) =>
      v.scope === scope &&
      v.target === (scope === "contract" ? contract?.id : targetId),
  );
  const prior =
    target === "customer" && !term
      ? data.legacyRates?.find((r) => r.customer_id === targetId)
      : undefined;
  const [value, setValue] = useState(
    term?.rate_cents == null ? "" : (term.rate_cents / 100).toFixed(2),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/contribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          month,
          expected: data.latest_config_id,
          target,
          target_id: targetId,
          rate_cents: parseMoney(value),
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to save the per-visit payment.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="business-rate-form" onSubmit={save}>
      <label>
        <span>
          <T
            text={
              ownerLabor
                ? "My labor per visit (optional)"
                : target === "customer"
                  ? "Customer payment override (optional)"
                  : "Default payment per visit"
            }
          />
        </span>
        <input
          inputMode="decimal"
          value={value}
          disabled={busy}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder={t(
            ownerLabor
              ? "Unpriced"
              : target === "customer"
                ? "Use technician default"
                : "Not priced",
          )}
        />
      </label>
      <button
        className="btn btn-secondary"
        disabled={busy || month < currentMonth()}
      >
        <T text={busy ? "Saving…" : "Save rate"} />
      </button>
      {term?.model === "monthly" && (
        <p className="note">
          <T text="An existing monthly payout is preserved. Saving here changes future estimates to per visit." />
        </p>
      )}
      {error && (
        <p role="alert" className="notice">
          {t(error)}
        </p>
      )}
      {saved && (
        <p role="status">
          <T text="Payment rate saved. Confirmed visits keep their captured rate." />
        </p>
      )}
      {prior && (
        <small>
          <T text="Legacy rate (review before use)" />:{" "}
          <Money cents={prior.rate_cents} />{" "}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setValue((prior.rate_cents / 100).toFixed(2))}
          >
            <T text="Use prior rate" />
          </button>
        </small>
      )}
      <small>
        <T
          text={
            ownerLabor
              ? "Leave blank to keep your labor unpriced."
              : "Leave a customer override blank to use the technician’s rate."
          }
        />
      </small>
    </form>
  );
}
export function CustomerContribution({ customerId }: { customerId: string }) {
  const { data, error, reload } = useBusiness(currentMonth());
  const c = data?.report.customers.find((c) => c.id === customerId);
  return (
    <div className="customer-contribution">
      {error ? (
        <p role="alert">
          <T text={error} />
        </p>
      ) : !data ? (
        <p role="status">
          <T text="Loading contribution…" />
        </p>
      ) : c ? (
        <>
          <div className="business-inline">
            <span>
              <T text="Estimated contribution" />
            </span>
            <strong>
              <Money cents={c.forecast.contribution} />
            </strong>
          </div>
          {c.forecast.unpricedOwnerVisits > 0 && (
            <p className="note">
              <T text="Owner labor is unpriced." />
            </p>
          )}
          <details className="business-details">
            <summary>
              <T text="Technician payment" />
            </summary>
            <p className="note">
              <T text="Customer-specific rate takes priority over the technician default." />
            </p>
            <PaymentRate
              key={data.latest_config_id ?? "new"}
              target="customer"
              targetId={customerId}
              data={data}
              onSaved={reload}
            />
          </details>
        </>
      ) : (
        <p className="note">
          <T text="Outside subcontract work stays in the optional legacy area." />
        </p>
      )}
    </div>
  );
}
