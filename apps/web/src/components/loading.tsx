"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Logo } from "@/components/brand";

/** Small inline spinner that inherits the text color, for buttons and status text. */
export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`spinner-inline ${className}`} aria-hidden="true" />;
}

/** Button content while busy: spinner plus an optional "…ing" label. Keeps the button's width steady. */
export function BusyLabel({ busy, busyLabel, children }: { busy: boolean; busyLabel?: ReactNode; children: ReactNode }) {
  return busy ? <><Spinner />{busyLabel ?? children}</> : <>{children}</>;
}

/**
 * Submit button for server-action forms: disables itself and shows a spinner while the form is
 * submitting, so a slow action can't be double-submitted. Must be rendered inside the <form>.
 */
export function SubmitButton({ children, pendingLabel, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending || undefined}>
      <BusyLabel busy={pending} busyLabel={pendingLabel}>{children}</BusyLabel>
    </button>
  );
}

/** Full-page loading state used by route loading.tsx files. Dark for live screens, light for the app. */
export function LoadingScreen({ label = "Loading…", tone = "light" }: { label?: string; tone?: "light" | "dark" }) {
  return (
    <main className={`loading-screen is-${tone}`} role="status" aria-live="polite">
      <div className="loading-mark"><Logo href={null} size={44} withName={false} /><span className="loading-ring" aria-hidden="true" /></div>
      <p>{label}</p>
    </main>
  );
}
