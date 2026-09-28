import type { Metadata } from "next";
import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import { AuthArt } from "@/components/auth-art";
import { Logo } from "@/components/brand";

export const metadata: Metadata = { title: "Sign in · Livo" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const { error, message, next } = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo href="/" size={40} />
        <h1>Welcome back</h1>
        <p className="muted">Sign in to create and present.</p>
        <form action={signIn} className="auth-form">
          <input type="hidden" name="next" value={next ?? "/dashboard"} />
          <label className="field field-wide"><span>Email</span><input required type="email" name="email" autoComplete="email" placeholder="you@example.com" /></label>
          <label className="field field-wide"><span>Password</span><input required minLength={6} type="password" name="password" autoComplete="current-password" placeholder="••••••••" /></label>
          {error && <p className="form-error">{error}</p>}
          {message && <p className="form-message">{message}</p>}
          <button className="button-primary big">Sign in →</button>
        </form>
        <p className="auth-switch">New to Livo? <Link href="/signup">Create an account</Link></p>
      </section>
      <AuthArt />
    </main>
  );
}
