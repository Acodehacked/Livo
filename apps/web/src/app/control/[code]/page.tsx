import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Controller } from "@/components/live/controller";
import { StatusScreen } from "@/components/live/status-screen";
import { realtimeHost, siteUrl } from "@/lib/env";
import { findRoomByCode, isExpired, issueToken, loadDoc, normaliseCode, staffAccess } from "@/lib/rooms";

export const metadata: Metadata = { title: "Controller · Livo" };
export const dynamic = "force-dynamic";

export default async function ControlRoom({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ key?: string }> }) {
  const [{ code: rawCode }, { key }] = await Promise.all([params, searchParams]);
  const code = normaliseCode(rawCode);
  const room = await findRoomByCode(code);
  if (!room) return <StatusScreen icon="?" title="Room not found" tone="error"><Link className="button-secondary" href="/dashboard">Back to dashboard</Link></StatusScreen>;
  const access = await staffAccess(room, key);
  if (!access) redirect(`/login?next=${encodeURIComponent(`/control/${code}`)}`);
  if (isExpired(room) && room.status !== "ended") return <StatusScreen icon="⌛" title="This room has expired"><Link className="button-secondary" href="/dashboard">Start a new session from the dashboard</Link></StatusScreen>;

  const doc = await loadDoc(room.presentation_id, { publicOnly: false });
  if (!doc) return <StatusScreen icon="?" title="Presentation not found" tone="error" />;
  const [token, presenterKey, controllerKey] = await Promise.all([issueToken(room, "admin"), issueToken(room, "presenter"), access === "owner" ? issueToken(room, "admin") : null]);
  const base = siteUrl();
  return (
    <Controller doc={doc} roomId={room.id} code={room.room_code} token={token} host={realtimeHost()}
      links={{ join: `${base}/join/${room.room_code}`, present: `${base}/present/${room.room_code}?key=${presenterKey}`, controller: controllerKey && `${base}/control/${room.room_code}?key=${controllerKey}` }} />
  );
}
