"use client";
import { useRef, useState } from "react";
import { Input, Button } from "./form-controls";
import { T } from "./i18n";
export function AccountPassword() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  async function save(data: FormData) {
    setBusy(true);
    setMessage("");
    try {
      if (data.get("password") !== data.get("confirmation"))
        throw new Error("New passwords do not match.");
      const r = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: data.get("current_password"),
          password: data.get("password"),
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setMessage("Password updated. Keep it in a secure password manager.");
      form.current?.reset();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to change password.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>
        <T text="Change password" />
      </summary>
      <form action={save} ref={form} className="form-grid">
        <Input
          label="Current password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
        />
        <Input
          label="New password (at least 16 characters)"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={16}
          maxLength={128}
          required
        />
        <Input
          label="Confirm new password"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={16}
          maxLength={128}
          required
        />
        <Button disabled={busy}>
          <T text="Update password" />
        </Button>
        {message && (
          <p role="status" className="notice full">
            <T text={message} />
          </p>
        )}
      </form>
    </details>
  );
}
