import type { Metadata } from "next";
import { Logo } from "@/components/brand";
import { SubmitButton } from "@/components/loading";
import { findRoom } from "./actions";

export const metadata: Metadata = { title: "Join a session · Livo" };

export default async function JoinByCode({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="join-shell">
      <Logo href="/" />
      <section className="join-card">
        <p className="eyebrow">Join a live session</p>
        <h1>Enter the room code</h1>
        <form action={findRoom} className="join-form">
          <input name="code" required autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} placeholder="AI2026" className="code-input" aria-label="Room code" />
          {error && <p className="form-error">{error}</p>}
          <SubmitButton className="button-primary big" pendingLabel="Finding room…">Continue →</SubmitButton>
        </form>
        <p className="muted">No account needed. The code is shown on the presenter&apos;s screen.</p>
      </section>
    </main>
  );
}
