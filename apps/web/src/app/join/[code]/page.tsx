import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { SubmitButton } from "@/components/loading";
import { Audience } from "@/components/live/audience";
import { StatusScreen } from "@/components/live/status-screen";
import { realtimeHost } from "@/lib/env";
import { existingParticipant, findRoomByCode, isExpired, loadDoc, normaliseCode } from "@/lib/rooms";
import { joinRoom } from "../actions";

export const metadata: Metadata = { title: "Live session · Livo" };
export const dynamic = "force-dynamic";

export default async function JoinRoom({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ code: rawCode }, { error }] = await Promise.all([params, searchParams]);
  const code = normaliseCode(rawCode);
  if (!code) return <StatusScreen icon="⚠" title="Invalid session link" tone="error"><p>Check the QR code or <Link href="/join">enter the room code</Link>.</p></StatusScreen>;

  const room = await findRoomByCode(code);
  if (!room) return <StatusScreen icon="?" title="Room not found" tone="error"><p>Check the room code <b>{code}</b> and try again.</p><Link className="button-secondary" href="/join">Enter a different code</Link></StatusScreen>;
  if (room.status === "ended" || isExpired(room)) return <StatusScreen icon="✓" title="This session has ended"><p>Thank you for participating.</p></StatusScreen>;

  const participant = await existingParticipant(room);
  if (participant) {
    const doc = await loadDoc(room.presentation_id, { publicOnly: true });
    if (!doc) return <StatusScreen icon="?" title="Room not found" tone="error" />;
    return <Audience doc={doc} roomId={room.id} code={room.room_code} token={participant.token} host={realtimeHost()} name={participant.claims.name ?? "Guest"} />;
  }

  return (
    <main className="join-shell">
      <Logo href="/" />
      <section className="join-card">
        <p className="eyebrow">Room {room.room_code}</p>
        <h1>Welcome!</h1>
        <form action={joinRoom.bind(null, room.room_code)} className="join-form">
          <label className="field field-wide"><span>Your name <i className="muted">(optional)</i></span><input name="name" maxLength={40} autoFocus autoComplete="nickname" placeholder="Abin" /></label>
          {error && <p className="form-error">{error}</p>}
          <SubmitButton className="button-primary big" pendingLabel="Joining…">Join session →</SubmitButton>
        </form>
        <p className="muted">Your name is only shown to the presenter.</p>
      </section>
    </main>
  );
}
