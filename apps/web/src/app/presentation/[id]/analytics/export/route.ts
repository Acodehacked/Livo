import { interactionTitle } from "@livo/types";
import { describeAnswer, interactionsOf, type ResponseRow } from "@/lib/analytics";
import { docFromRow, PRESENTATION_SELECT, type PresentationRow } from "@/lib/doc";
import { createClient } from "@/lib/supabase/server";

const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** Raw responses for one session as CSV (owner only, enforced by RLS). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roomId = new URL(request.url).searchParams.get("room");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !roomId) return new Response("Not found", { status: 404 });
  const [{ data: row }, { data: participants }, { data: responses }] = await Promise.all([
    supabase.from("presentations").select(PRESENTATION_SELECT).eq("id", id).eq("owner_id", user.id).maybeSingle(),
    supabase.from("participants").select("id, display_name").eq("room_id", roomId),
    supabase.from("responses").select("interaction_id, participant_id, response, correct, created_at").eq("room_id", roomId).order("created_at").limit(100_000),
  ]);
  if (!row) return new Response("Not found", { status: 404 });
  const items = new Map(interactionsOf(docFromRow(row as PresentationRow)).map((entry) => [entry.item.id, entry]));
  const names = new Map((participants ?? []).map((person) => [person.id, person.display_name || "Guest"]));
  const lines = [["Participant", "Slide", "Question", "Type", "Answer", "Correct", "Answered at"].map(cell).join(",")];
  for (const response of (responses ?? []) as ResponseRow[]) {
    const entry = items.get(response.interaction_id);
    if (!entry) continue;
    lines.push([names.get(response.participant_id) ?? "Guest", String(entry.slideIndex + 1), interactionTitle(entry.item), entry.item.kind, describeAnswer(entry.item, response.response), response.correct === null ? "" : response.correct ? "yes" : "no", response.created_at].map(cell).join(","));
  }
  return new Response(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="livo-session-${roomId.slice(0, 8)}.csv"` } });
}
