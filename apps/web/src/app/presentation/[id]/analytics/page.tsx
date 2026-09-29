import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { ResultDetail } from "@/components/results";
import { analyse, type ParticipantRow, type ResponseRow } from "@/lib/analytics";
import { docFromRow, PRESENTATION_SELECT, type PresentationRow } from "@/lib/doc";
import { syncRooms } from "@/lib/room-sync";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Analytics · Livo" };

const SYNC_WINDOW = 3 * 24 * 60 * 60 * 1000;

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
const when = (date: string | null) => (date ? new Date(date).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "—");
const duration = (start: string | null, end: string | null) => {
  if (!start || !end) return null;
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
};

export default async function Analytics({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ room?: string }> }) {
  const [{ id }, { room: roomParam }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Rooms live for 24h; pull recent ones from the realtime server in case its own flush never arrived.
  const { data: recent } = await supabase.from("rooms").select("id").eq("presentation_id", id).gt("created_at", new Date(Date.now() - SYNC_WINDOW).toISOString()).order("created_at", { ascending: false }).limit(10);
  if (recent?.length) await syncRooms(recent.map((item) => item.id));
  const [{ data: row }, { data: rooms }] = await Promise.all([
    supabase.from("presentations").select(PRESENTATION_SELECT).eq("id", id).eq("owner_id", user.id).maybeSingle(),
    supabase.from("rooms").select("id, room_code, status, created_at, started_at, ended_at, participants(count), responses(count)").eq("presentation_id", id).order("created_at", { ascending: false }),
  ]);
  if (!row) notFound();
  const doc = docFromRow(row as PresentationRow);
  const count = (value: unknown) => (value as { count: number }[] | null)?.[0]?.count ?? 0;
  const room = rooms?.find((item) => item.id === roomParam) ?? rooms?.find((item) => count(item.responses) > 0) ?? rooms?.[0];

  let analytics = null;
  if (room) {
    const [{ data: participants }, { data: responses }] = await Promise.all([
      supabase.from("participants").select("id, display_name, joined_at").eq("room_id", room.id).order("joined_at"),
      supabase.from("responses").select("interaction_id, participant_id, response, correct, created_at").eq("room_id", room.id).limit(50_000),
    ]);
    analytics = analyse(doc, (participants ?? []) as ParticipantRow[], (responses ?? []) as ResponseRow[]);
  }
  const quizzes = analytics?.items.filter((entry) => entry.item.kind === "quiz") ?? [];
  const surveys = analytics?.items.filter((entry) => entry.item.kind !== "quiz") ?? [];

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <Logo href="/dashboard" />
        <Link href="/dashboard" className="text-button">← Dashboard</Link>
        <Link href={`/presentation/${id}`} className="text-button">Edit presentation</Link>
      </nav>
      <main className="analytics">
        <header className="dashboard-head">
          <div><p className="eyebrow">Session analytics</p><h1>{doc.title}</h1></div>
          {room && <a className="button-secondary" href={`/presentation/${id}/analytics/export?room=${room.id}`}>Export CSV</a>}
        </header>

        {!rooms?.length ? (
          <div className="empty"><p>No sessions yet</p><span>Present this deck to start collecting responses.</span></div>
        ) : (
          <div className="analytics-layout">
            <aside className="session-picker" aria-label="Sessions">
              <h2 className="section-title">Sessions</h2>
              {rooms.map((item) => (
                <Link key={item.id} href={`?room=${item.id}`} className={`session-option${item.id === room?.id ? " is-current" : ""}`}>
                  <b>{when(item.started_at ?? item.created_at)}</b>
                  <small>Room {item.room_code} · {count(item.participants)} people · {count(item.responses)} responses</small>
                  <span className={`status-pill is-${item.status}`}>{item.status}</span>
                </Link>
              ))}
            </aside>

            {room && analytics && (
              <div className="analytics-body">
                <p className="muted">Room {room.room_code} · started {when(room.started_at)}{duration(room.started_at, room.ended_at) ? ` · ran ${duration(room.started_at, room.ended_at)}` : ""}</p>
                <section className="metrics">
                  <Metric label="Participants" value={String(analytics.participants)} />
                  <Metric label="Responses" value={String(analytics.responses)} />
                  <Metric label="Completion" value={pct(analytics.completion)} hint="Answered every interaction used" />
                  <Metric label="Quiz accuracy" value={pct(analytics.quizAccuracy)} />
                  <Metric label="Average rating" value={analytics.averageRating === null ? "—" : `${analytics.averageRating.toFixed(1)} / 5`} />
                  <Metric label="Interaction rate" value={pct(analytics.interactionRate)} hint="Answered at least once" />
                </section>

                {!!quizzes.length && <section><h2 className="section-title">Quiz results</h2><div className="result-grid">{quizzes.map((entry) => <div key={entry.item.id}><span className="muted">Slide {entry.slideIndex + 1}</span><ResultDetail item={entry.item} aggregate={entry.aggregate} /></div>)}</div></section>}
                {!!surveys.length && <section><h2 className="section-title">Survey results</h2><div className="result-grid">{surveys.map((entry) => <div key={entry.item.id}><span className="muted">Slide {entry.slideIndex + 1}</span><ResultDetail item={entry.item} aggregate={entry.aggregate} /></div>)}</div></section>}

                {!!analytics.leaderboard.length && (
                  <section>
                    <h2 className="section-title">Quiz leaderboard</h2>
                    <ol className="leaderboard">{analytics.leaderboard.map((entry, index) => <li key={index}><span>{index + 1}</span><b>{entry.name}</b><small>{entry.correct} correct</small><strong>{entry.points} pts</strong></li>)}</ol>
                  </section>
                )}

                <section>
                  <h2 className="section-title">Participants</h2>
                  {analytics.people.length ? (
                    <table className="table"><thead><tr><th>Name</th><th>Joined</th><th>Interactions answered</th></tr></thead>
                      <tbody>{analytics.people.map((person, index) => <tr key={index}><td>{person.name}</td><td>{when(person.joinedAt)}</td><td>{person.responses}</td></tr>)}</tbody></table>
                  ) : <p className="muted">Nobody joined this session.</p>}
                </section>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const Metric = ({ label, value, hint }: { label: string; value: string; hint?: string }) => <div className="metric" title={hint}><span>{label}</span><strong>{value}</strong></div>;
