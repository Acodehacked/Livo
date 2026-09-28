import "server-only";
import { publicDoc, signRoomToken, verifyRoomToken, type PresentationDoc, type RoomClaims, type RoomRole, type RoomStatus } from "@livo/types";
import { cookies } from "next/headers";
import { docFromRow, PRESENTATION_SELECT, type PresentationRow } from "@/lib/doc";
import { roomEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type RoomRecord = { id: string; presentation_id: string; owner_id: string; room_code: string; status: RoomStatus; expires_at: string; started_at: string | null; ended_at: string | null; created_at: string };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
export const generateRoomCode = (length = 6) => Array.from(crypto.getRandomValues(new Uint8Array(length)), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
export const normaliseCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

const ROOM_FIELDS = "id, presentation_id, owner_id, room_code, status, expires_at, started_at, ended_at, created_at";

export async function findRoomByCode(code: string): Promise<RoomRecord | null> {
  const { data } = await createAdminClient().from("rooms").select(ROOM_FIELDS).eq("room_code", normaliseCode(code)).maybeSingle();
  return data as RoomRecord | null;
}

export const isExpired = (room: RoomRecord) => new Date(room.expires_at).getTime() < Date.now();

export async function loadDoc(presentationId: string, { publicOnly }: { publicOnly: boolean }): Promise<PresentationDoc | null> {
  const { data } = await createAdminClient().from("presentations").select(PRESENTATION_SELECT).eq("id", presentationId).maybeSingle();
  if (!data) return null;
  const doc = docFromRow(data as PresentationRow);
  return publicOnly ? publicDoc(doc) : doc;
}

export async function issueToken(room: RoomRecord, role: RoomRole, extra: Partial<RoomClaims> = {}) {
  const exp = Math.floor(new Date(room.expires_at).getTime() / 1000);
  return signRoomToken({ roomId: room.id, role, presentationId: room.presentation_id, exp, ...extra }, roomEnv().ROOM_TOKEN_SECRET);
}

/** Presenter devices: the logged-in owner, or anyone holding a key link the owner shared. */
export async function staffAccess(room: RoomRecord, key: string | undefined): Promise<"owner" | "key" | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id === room.owner_id) return "owner";
  const claims = await verifyRoomToken(key, roomEnv().ROOM_TOKEN_SECRET);
  return claims && claims.roomId === room.id && (claims.role === "admin" || claims.role === "presenter") ? "key" : null;
}

export const participantCookie = (roomId: string) => `livo_p_${roomId.replace(/-/g, "")}`;

/** The audience member's stored token for this room, if still valid. */
export async function existingParticipant(room: RoomRecord) {
  const token = (await cookies()).get(participantCookie(room.id))?.value;
  const claims = await verifyRoomToken(token, roomEnv().ROOM_TOKEN_SECRET);
  return claims && claims.roomId === room.id && claims.role === "participant" ? { token: token!, claims } : null;
}
