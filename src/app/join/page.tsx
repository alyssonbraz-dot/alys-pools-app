"use client";
import { useEffect, useState } from "react";
import { T } from "@/components/i18n";
export default function Join() {
  const [link, setLink] = useState({ invitation: "", token_hash: "" }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1));
    queueMicrotask(() =>
      setLink({
        invitation: p.get("invitation") ?? "",
        token_hash: p.get("token_hash") ?? "",
      }),
    );
    window.history.replaceState(null, "", "/join");
  }, []);
  async function accept(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...link, password: form.get("password") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.replace("/stops");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to accept invitation.");
      setBusy(false);
    }
  }
  return (
    <main className="panel login-card">
      <h1>
        <T text="Join ALYS Pool Services" />
      </h1>
      <p>
        <T text="Create your own password to accept your technician invitation." />
      </p>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <form action={accept}>
        <label className="form-field">
          <T text="New password (at least 16 characters)" />
          <input
            name="password"
            type="password"
            minLength={16}
            maxLength={128}
            required
            autoComplete="new-password"
          />
        </label>
        <button className="btn btn-primary" disabled={busy || !link.token_hash}>
          <T text={busy ? "Verifying…" : "Accept invitation"} />
        </button>
      </form>
    </main>
  );
}
