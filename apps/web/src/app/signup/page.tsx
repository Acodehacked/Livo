import type { Metadata } from "next";
import Link from "next/link";
import { signUp } from "@/app/auth/actions";
import { AuthArt } from "@/components/auth-art";
import { Logo } from "@/components/brand";

export const metadata: Metadata = { title: "Create account · Livo" };

export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo href="/" size={40} />
        <h1>Create your account</h1>
        <p className="muted">Build presentations your audience can answer, vote and react to — live.</p>
        <form action={signUp} className="auth-form">
          <label className="field field-wide"><span>Email</span><input required type="email" name="email" autoComplete="email" placeholder="you@example.com" /></label>
          <label className="field field-wide"><span>Password</span><input required minLength={6} type="password" name="password" autoComplete="new-password" placeholder="At least 6 characters" /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="button-primary big">Create account →</button>
        </form>
        <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
      </section>
      <AuthArt />
    </main>
  );
}
