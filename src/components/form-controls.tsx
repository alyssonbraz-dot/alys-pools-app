"use client";
import type { InputHTMLAttributes, ButtonHTMLAttributes } from "react";
import { T,LocaleInput } from "./i18n";
export function Input({
  label,
  onChange,
  ...props
}: { label: string; onChange?: (value: string) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange"
>) {
  return (
    <label className="form-field">
      <T text={label} />
      <LocaleInput {...props} inputMode={props.inputMode??(props.type==="number"?"decimal":props.type==="tel"?"tel":props.type==="email"?"email":undefined)} autoCapitalize={props.autoCapitalize??(props.type==="email"?"none":undefined)} onChange={(e) => onChange?.(e.target.value)} />
    </label>
  );
}
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  return <button {...props} className={`btn btn-${variant} ${className}`} />;
}
