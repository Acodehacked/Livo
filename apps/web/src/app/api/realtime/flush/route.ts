import { NextResponse } from "next/server";
import { verifyRoomToken, type FlushPayload } from "@livo/types";
import { roomEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Batch persistence from the realtime server (PRD §101): responses are aggregated live in the room
 * and written here in batches, together with room status changes. Authenticated with a short-lived
 * system token signed with ROOM_TOKEN_SECRET.
 */
export async function POST(request: Request) {
  const claims = await verifyRoomToken(request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""), roomEnv().ROOM_TOKEN_SECRET);
  if (!claims || claims.role !== "system") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as FlushPayload | null;
  if (!body || body.roomId !== claims.roomId || !Array.isArray(body.responses) || body.responses.length > 1000) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: room } = await supabase.from("rooms").select("id, presentation_id").eq("id", body.roomId).maybeSingle();
  if (!room) return NextResponse.json({ ok: true, skipped: "room not found" });

  if (body.status) {
    const { status, startedAt, endedAt } = body.status;
    await supabase.from("rooms").update({ status, started_at: startedAt ? new Date(startedAt).toISOString() : null, ended_at: endedAt ? new Date(endedAt).toISOString() : null }).eq("id", room.id);
  }

  if (body.responses.length) {
    // Latest answer wins per (interaction, participant); upsert can't touch one row twice in a statement.
    const latest = new Map<string, FlushPayload["responses"][number]>();
    for (const response of body.responses) latest.set(`${response.interactionId}:${response.participantId}`, response);
    const rows = [...latest.values()];
    const [{ data: interactions }, { data: participants }] = await Promise.all([
      supabase.from("interactions").select("id, slides!inner(presentation_id)").in("id", [...new Set(rows.map((row) => row.interactionId))]).eq("slides.presentation_id", room.presentation_id),
      supabase.from("participants").select("id").eq("room_id", room.id).in("id", [...new Set(rows.map((row) => row.participantId))]),
    ]);
    const knownInteractions = new Set((interactions ?? []).map((row) => row.id));
    const knownParticipants = new Set((participants ?? []).map((row) => row.id));
    const valid = rows.filter((row) => knownInteractions.has(row.interactionId) && knownParticipants.has(row.participantId));
    if (valid.length) {
      const { error } = await supabase.from("responses").upsert(valid.map((row) => ({
        room_id: room.id, interaction_id: row.interactionId, participant_id: row.participantId, response: row.value, correct: row.correct ?? null, created_at: new Date(row.at).toISOString(),
      })), { onConflict: "interaction_id,participant_id" });
      if (error) return NextResponse.json({ error: "Write failed" }, { status: 500 });
    }
    const seen = [...knownParticipants];
    if (seen.length) await supabase.from("participants").update({ last_seen_at: new Date().toISOString() }).in("id", seen);
  }
  return NextResponse.json({ ok: true });
}
