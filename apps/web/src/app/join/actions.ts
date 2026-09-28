"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { findRoomByCode, isExpired, issueToken, normaliseCode, participantCookie } from "@/lib/rooms";

// Best-effort per-instance join throttle. Production should add a Cloudflare rate-limiting rule on /join (PRD §52).
const recentJoins = new Map<string, number[]>();
function throttled(key: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const hits = (recentJoins.get(key) ?? []).filter((at) => now - at < windowMs);
  hits.push(now);
  recentJoins.set(key, hits);
  if (recentJoins.size > 5000) recentJoins.clear();
  return hits.length > limit;
}

export async function findRoom(formData: FormData) {
  const code = normaliseCode(String(formData.get("code") ?? ""));
  redirect(code ? `/join/${code}` : "/join?error=Enter the room code shown on screen.");
}

/** Joins without an account: creates a participant row and stores a signed participant token in a cookie. */
export async function joinRoom(code: string, formData: FormData) {
  const room = await findRoomByCode(code);
  if (!room || room.status === "ended" || isExpired(room)) redirect(`/join/${normaliseCode(code)}`);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (throttled(ip)) redirect(`/join/${room.room_code}?error=Too many attempts. Wait a minute and try again.`);

  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "Guest";
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", nonce)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const { data: participant, error } = await createAdminClient().from("participants").insert({ room_id: room.id, display_name: name, session_token_hash: hash }).select("id").single();
  if (error || !participant) redirect(`/join/${room.room_code}?error=Couldn't join right now. Try again.`);

  const token = await issueToken(room, "participant", { participantId: participant.id, name, presentationId: undefined });
  (await cookies()).set(participantCookie(room.id), token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    expires: new Date(room.expires_at),
  });
  redirect(`/join/${room.room_code}`);
}

export async function leaveRoom(code: string) {
  const room = await findRoomByCode(code);
  if (room) (await cookies()).delete(participantCookie(room.id));
  redirect("/join");
}
