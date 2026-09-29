import { NextResponse } from "next/server";
import { verifyRoomToken, type FlushPayload } from "@livo/types";
import { roomEnv } from "@/lib/env";
import { persistRoomData } from "@/lib/room-sync";

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

  const result = await persistRoomData(body);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 500 });
}
