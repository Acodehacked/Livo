"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/rooms";

/**
 * Opens the controller for a presentation. Reuses the presentation's active room unless `fresh`
 * is set, so pressing Present twice doesn't scatter the audience across rooms.
 */
export async function startSession(presentationId: string, fresh = false): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: presentation } = await supabase.from("presentations").select("id, slides(id)").eq("id", presentationId).eq("owner_id", user.id).maybeSingle();
  if (!presentation) return { error: "Presentation not found." };
  if (!presentation.slides?.length) return { error: "Add at least one slide before presenting." };

  if (!fresh) {
    const { data: active } = await supabase.from("rooms").select("room_code").eq("presentation_id", presentationId).neq("status", "ended").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (active) redirect(`/control/${active.room_code}`);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const { error } = await supabase.from("rooms").insert({ presentation_id: presentationId, owner_id: user.id, room_code: code, status: "ready" });
    if (!error) redirect(`/control/${code}`);
    if (error.code !== "23505") return { error: "Couldn't create a room. Try again." };
  }
  return { error: "Couldn't generate a unique room code. Try again." };
}

export async function startSessionForm(formData: FormData) {
  const result = await startSession(String(formData.get("presentationId")), formData.get("fresh") === "1");
  if (result?.error) redirect(`/dashboard?error=${encodeURIComponent(result.error)}`);
}
