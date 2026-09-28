import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PresentScreen } from "@/components/live/present";
import { StatusScreen } from "@/components/live/status-screen";
import { realtimeHost, siteUrl } from "@/lib/env";
import { findRoomByCode, isExpired, issueToken, loadDoc, normaliseCode, staffAccess } from "@/lib/rooms";

export const metadata: Metadata = { title: "Presenting · Livo" };
export const dynamic = "force-dynamic";

export default async function PresentRoom({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ key?: string }> }) {
  const [{ code: rawCode }, { key }] = await Promise.all([params, searchParams]);
  const code = normaliseCode(rawCode);
  const room = await findRoomByCode(code);
  if (!room) return <StatusScreen icon="?" title="Room not found" tone="error" />;
  if (!(await staffAccess(room, key))) redirect(`/login?next=${encodeURIComponent(`/present/${code}`)}`);
  if (isExpired(room) && room.status !== "ended") return <StatusScreen icon="⌛" title="This room has expired" />;
  // The projector is public-facing: it gets the full deck (to highlight correct answers after close)
  // but its token has the presenter role, so the room never sends it "Only me" results.
  const doc = await loadDoc(room.presentation_id, { publicOnly: false });
  if (!doc) return <StatusScreen icon="?" title="Presentation not found" tone="error" />;
  const token = await issueToken(room, "presenter");
  return <PresentScreen doc={doc} roomId={room.id} code={room.room_code} token={token} host={realtimeHost()} joinUrl={`${siteUrl()}/join/${room.room_code}`} />;
}
