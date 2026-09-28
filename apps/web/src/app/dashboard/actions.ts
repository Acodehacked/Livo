"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { docFromRow, PRESENTATION_SELECT, savePayload, withFreshIds, type PresentationRow } from "@/lib/doc";
import { TEMPLATES } from "@/lib/templates";
import { createClient } from "@/lib/supabase/server";

async function currentUser() { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login"); return { supabase, user }; }

export async function createPresentation(formData: FormData) {
  const { supabase, user } = await currentUser();
  const template = TEMPLATES.find((item) => item.id === formData.get("template"));
  const title = String(formData.get("title") || template?.name || "Untitled presentation").slice(0, 120);
  const { data, error } = await supabase.from("presentations").insert({ owner_id: user.id, title }).select("id").single();
  if (error) redirect(`/dashboard?error=${encodeURIComponent("Couldn't create the presentation.")}`);
  if (template) {
    const doc = withFreshIds({ ...template.build(), title }, data.id);
    const { error: saveError } = await supabase.rpc("save_presentation", { p_presentation_id: data.id, p_title: title, p_slides: savePayload(doc) });
    if (saveError) redirect(`/dashboard?error=${encodeURIComponent("Created the deck, but couldn't apply the template. Is migration 0002 applied?")}`);
  }
  redirect(`/presentation/${data.id}`);
}

export async function duplicatePresentation(formData: FormData) {
  const { supabase, user } = await currentUser();
  const { data: source } = await supabase.from("presentations").select(PRESENTATION_SELECT).eq("id", String(formData.get("id"))).eq("owner_id", user.id).maybeSingle();
  if (!source) return;
  const original = docFromRow(source as PresentationRow);
  const title = `${original.title} (copy)`.slice(0, 120);
  const { data, error } = await supabase.from("presentations").insert({ owner_id: user.id, title }).select("id").single();
  if (error) return;
  if (original.slides.length) await supabase.rpc("save_presentation", { p_presentation_id: data.id, p_title: title, p_slides: savePayload(withFreshIds({ ...original, title }, data.id)) });
  revalidatePath("/dashboard");
}

export async function renamePresentation(formData: FormData) { const { supabase, user } = await currentUser(); await supabase.from("presentations").update({ title: String(formData.get("title") || "Untitled presentation").slice(0, 120), updated_at: new Date().toISOString() }).eq("id", String(formData.get("id"))).eq("owner_id", user.id); revalidatePath("/dashboard"); }
export async function deletePresentation(formData: FormData) { const { supabase, user } = await currentUser(); await supabase.from("presentations").delete().eq("id", String(formData.get("id"))).eq("owner_id", user.id); revalidatePath("/dashboard"); }
