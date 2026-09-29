import "server-only";
import { signRoomToken, type FlushPayload } from "@livo/types";
import { realtimeUrl, roomEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Writes a room's status and responses to Supabase. Used for pushes from the realtime server
 * (/api/realtime/flush) and for pulls from it (syncRooms). Idempotent: latest answer wins per
 * (interaction, participant), so the same batch can be written more than once.
 */
export async function persistRoomData(body: FlushPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { data: room } = await supabase.from("rooms").select("id, presentation_id").eq("id", body.roomId).maybeSingle();
  if (!room) return { ok: true };

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
      if (error) return { ok: false, error: "Write failed" };
    }
    const seen = [...knownParticipants];
    if (seen.length) await supabase.from("participants").update({ last_seen_at: new Date().toISOString() }).in("id", seen);
  }
  return { ok: true };
}

/**
 * Pulls every stored answer (and the live status) from the realtime rooms and saves them. This
 * backs up the realtime server's own flush, which fails silently when it can't reach this app
 * (e.g. a deployed worker with WEB_ORIGIN pointing at localhost). Failures are ignored: the page
 * then shows whatever the database already has.
 */
export async function syncRooms(roomIds: string[]): Promise<void> {
  const secret = roomEnv().ROOM_TOKEN_SECRET;
  await Promise.all(roomIds.map(async (roomId) => {
    try {
      const token = await signRoomToken({ roomId, role: "system", exp: Math.floor(Date.now() / 1000) + 60 }, secret);
      const response = await fetch(realtimeUrl(`/parties/main/${roomId}`), { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (!response.ok) return;
      const body = (await response.json()) as FlushPayload;
      if (body.roomId === roomId && Array.isArray(body.responses)) await persistRoomData(body);
    } catch (error) {
      console.error(`room sync failed for ${roomId}`, error);
    }
  }));
}
