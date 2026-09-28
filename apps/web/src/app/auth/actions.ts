"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const readCredentials = (formData: FormData) => ({ email: String(formData.get("email") ?? "").trim(), password: String(formData.get("password") ?? "") });
// Only same-site relative paths, so ?next= can't be used as an open redirect.
const safeNext = (value: FormDataEntryValue | null) => { const next = String(value ?? ""); return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"; };

export async function signIn(formData: FormData) {
  const { email, password } = readCredentials(formData); const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  redirect(next);
}
export async function signUp(formData: FormData) {
  const { email, password } = readCredentials(formData); const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback` } });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  redirect("/login?message=Check your email to confirm your account.");
}
export async function signOut() { const supabase = await createClient(); await supabase.auth.signOut(); redirect("/"); }
