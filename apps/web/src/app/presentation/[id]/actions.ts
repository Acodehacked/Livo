"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const finite = z.number().finite();
const slidesSchema = z.array(z.object({
  id: z.string().uuid(), title: z.string().max(200), notes: z.string().max(20_000), type: z.enum(["normal", "interactive"]), background: z.record(z.unknown()),
  elements: z.array(z.object({
    id: z.string().uuid(), type: z.enum(["text", "image", "shape", "icon", "link", "button", "quiz", "poll", "rating", "slider", "open_text", "form"]),
    x: finite, y: finite, width: finite.positive(), height: finite.positive(), rotation: finite, z_index: z.number().int(),
    properties: z.record(z.unknown()),
    interaction: z.object({ type: z.string(), title: z.string(), config: z.record(z.unknown()), required: z.boolean() }).nullable(),
  })).max(300),
})).min(1).max(500);

export type SaveResult = { ok: true; savedAt: string } | { ok: false; error: string };

/** Autosave target: validates, then writes the whole document atomically via save_presentation(). */
export async function savePresentation(id: string, title: string, slides: unknown): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again to keep saving." };
  const parsed = slidesSchema.safeParse(slides);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return { ok: false, error: "Some slide data was invalid and wasn't saved." };
  if (JSON.stringify(parsed.data).length > 4_000_000) return { ok: false, error: "This presentation is too large to save." };
  const { error } = await supabase.rpc("save_presentation", { p_presentation_id: id, p_title: title.slice(0, 120), p_slides: parsed.data });
  if (error) return { ok: false, error: error.code === "P0002" ? "Presentation not found." : "Couldn't save your changes." };
  return { ok: true, savedAt: new Date().toISOString() };
}
