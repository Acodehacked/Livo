import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { Logo } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";
import { NewPresentationForm } from "./new-presentation-form";
import { PresentationActions } from "./presentation-actions";

export const metadata: Metadata = { title: "Dashboard · Livo" };

const relative = (date: string) => {
  const minutes = Math.round((new Date(date).getTime() - Date.now()) / 60000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  if (Math.abs(minutes) < 1440) return format.format(Math.round(minutes / 60), "hour");
  return format.format(Math.round(minutes / 1440), "day");
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: presentations }, { data: rooms }] = await Promise.all([
    supabase.from("presentations").select("id, title, status, updated_at, slides(count)").order("updated_at", { ascending: false }),
    supabase.from("rooms").select("id, room_code, status, created_at, started_at, ended_at, expires_at, presentation_id, presentations(title), participants(count)").order("created_at", { ascending: false }).limit(8),
  ]);
  const name = user.email?.split("@")[0] ?? "there";

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <Logo href="/dashboard" />
        <span className="app-nav-user">{user.email}</span>
        <form action={signOut}><button className="text-button">Sign out</button></form>
      </nav>
      <main className="dashboard">
        <header className="dashboard-head">
          <div><p className="eyebrow">Welcome back, {name}</p><h1>Your presentations</h1></div>
          <NewPresentationForm />
        </header>
        {error && <p className="banner banner-warn">{error}</p>}

        <section className="deck-list" aria-label="Presentations">
          {presentations?.length ? presentations.map((deck) => {
            const slideCount = (deck.slides as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
            return (
              <article className="deck" key={deck.id}>
                <Link href={`/presentation/${deck.id}`} className="deck-main">
                  <span className="deck-icon" aria-hidden>▶</span>
                  <span><h2>{deck.title}</h2><p>{slideCount} {slideCount === 1 ? "slide" : "slides"} · edited {relative(deck.updated_at)}</p></span>
                </Link>
                <PresentationActions id={deck.id} title={deck.title} />
              </article>
            );
          }) : (
            <div className="empty"><p>No presentations yet</p><span>Create one from scratch or start from a template.</span></div>
          )}
        </section>

        {!!rooms?.length && (
          <section className="sessions" aria-label="Recent sessions">
            <h2 className="section-title">Recent sessions</h2>
            <div className="session-list">
              {rooms.map((room) => {
                const active = room.status !== "ended" && new Date(room.expires_at).getTime() > Date.now();
                const participants = (room.participants as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
                const title = (room.presentations as unknown as { title: string } | null)?.title ?? "Presentation";
                return (
                  <article key={room.id} className="session">
                    <span className={`status-pill is-${active ? room.status : "ended"}`}>{active ? room.status : "ended"}</span>
                    <div><b>{title}</b><small>Room {room.room_code} · {relative(room.started_at ?? room.created_at)} · {participants} participants</small></div>
                    {active ? <Link className="button-secondary small" href={`/control/${room.room_code}`}>Open controller</Link> : <Link className="text-button" href={`/presentation/${room.presentation_id}/analytics?room=${room.id}`}>Analytics</Link>}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
