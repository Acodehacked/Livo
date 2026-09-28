import { NextResponse } from "next/server";
import { z } from "zod";
import { IMAGE_TYPES, IMAGE_TYPES_LABEL, MAX_IMAGE_BYTES } from "@/lib/image-types";
import { createClient } from "@/lib/supabase/server";
import { createAssetUploadUrl } from "@/lib/storage/r2";

const schema = z.object({ presentationId: z.string().uuid(), fileName: z.string().min(1).max(255), contentType: z.enum(IMAGE_TYPES), size: z.number().int().positive().max(MAX_IMAGE_BYTES).optional() });

/** Browser → signed R2 upload URL; the asset's metadata is recorded in Supabase (PRD §81). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to upload images." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Use a ${IMAGE_TYPES_LABEL} image up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` }, { status: 400 });
  const { data: presentation } = await supabase.from("presentations").select("id").eq("id", parsed.data.presentationId).eq("owner_id", user.id).maybeSingle();
  if (!presentation) return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
  let upload;
  try { upload = await createAssetUploadUrl(parsed.data); } catch { return NextResponse.json({ error: "Image uploads aren't configured (R2 settings missing). Paste an image URL instead." }, { status: 503 }); }
  await supabase.from("assets").insert({ owner_id: user.id, presentation_id: presentation.id, bucket: process.env.R2_BUCKET, object_key: upload.key, file_name: parsed.data.fileName, mime_type: parsed.data.contentType, size: parsed.data.size ?? null });
  return NextResponse.json(upload);
}
