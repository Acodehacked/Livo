import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Editor } from "@/components/editor/editor";
import { docFromRow, PRESENTATION_SELECT, type PresentationRow } from "@/lib/doc";
import { blankSlide, SLIDE_LAYOUTS } from "@/lib/elements";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Editor · Livo" };

export default async function PresentationEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("presentations").select(PRESENTATION_SELECT).eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!data) notFound();
  const doc = docFromRow(data as PresentationRow);
  // A brand-new deck starts with a title slide (saved on the first autosave).
  const isNew = !doc.slides.length;
  if (isNew) doc.slides.push(SLIDE_LAYOUTS.find((layout) => layout.id === "title")?.build() ?? blankSlide());
  return <Editor initialDoc={doc} unsaved={isNew} />;
}
