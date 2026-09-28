"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { resultsOnScreen, slideInteractions, type PresentationDoc } from "@livo/types";
import { Logo } from "@/components/brand";
import { QrCode } from "@/components/qr";
import { ResultDetail } from "@/components/results";
import { SlideThumb } from "@/components/slide/render";
import { startSessionForm } from "@/app/rooms/actions";
import { sanitizeHtml } from "@/lib/sanitize";
import { formatSeconds, useCountdown, useRoom } from "@/lib/use-room";

export interface ShareLinks { join: string; present: string; controller: string | null }

const STATUS_LABEL = { draft: "Draft", ready: "Ready", live: "Live", paused: "Paused", ended: "Ended" } as const;
const TIMER_PRESETS = [30, 60, 120, 300];

export function Controller({ doc, roomId, code, token, host, links }: { doc: PresentationDoc; roomId: string; code: string; token: string; host: string; links: ShareLinks }) {
  const { state, results, connection, send } = useRoom({ host, roomId, token });
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [panel, setPanel] = useState<"live" | "share">("live");
  const [customTimer, setCustomTimer] = useState(90);
  const countdown = useCountdown(state?.timer);

  const index = state?.currentSlideId ? Math.max(0, doc.slides.findIndex((slide) => slide.id === state.currentSlideId)) : 0;
  const current = doc.slides[index];
  const next = doc.slides[index + 1];
  const interactions = slideInteractions(current);
  const live = state?.interaction?.slideId === current?.id ? state.interaction : null;
  const ended = state?.status === "ended";
  const resultsVisible = !!live && interactions.some((item) => resultsOnScreen(live, item.config.results));

  const goTo = useCallback((target: number) => {
    const slide = doc.slides[target];
    if (!slide || ended) return;
    send({ type: "SLIDE_CHANGED", payload: { slideId: slide.id, index: target, interactions: slideInteractions(slide) } });
  }, [doc.slides, ended, send]);

  const start = () => {
    send({ type: "PRESENTATION_STARTED", payload: {} });
    if (!state?.currentSlideId) goTo(0);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") goTo(index + 1);
      if (event.key === "ArrowLeft" || event.key === "PageUp") goTo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  const correct = live?.status === "closed" ? Object.fromEntries(interactions.filter((item) => item.kind === "quiz").map((item) => [item.id, item.config.correct])) : undefined;

  return (
    <div className="controller">
      <header className="controller-top">
        <Logo href="/dashboard" withName={false} size={28} />
        <div className="controller-title"><strong>{doc.title}</strong><span>Room <b>{code}</b></span></div>
        <span className={`status-pill is-${state?.status ?? "ready"}`}>{state?.status === "live" && <i />}{STATUS_LABEL[state?.status ?? "ready"]}</span>
        <span className="participants" title="Participants connected">👥 {state?.participantCount ?? 0}</span>
        <span className={`conn conn-${connection}`}>{connection === "open" ? "Connected" : connection === "reconnecting" ? "Reconnecting…" : connection === "invalid" ? "Access denied" : "Connecting…"}</span>
        {!ended && <button type="button" className="button-danger" onClick={() => setConfirmEnd(true)}>End session</button>}
      </header>

      {connection === "invalid" && <div className="banner banner-warn">This controller link is no longer valid. Open the session again from your dashboard.</div>}
      {connection === "reconnecting" && <div className="banner banner-warn">Connection lost — the presentation keeps running. Reconnecting…</div>}

      <nav className="controller-tabs">
        <button type="button" className={panel === "live" ? "is-active" : ""} onClick={() => setPanel("live")}>Control</button>
        <button type="button" className={panel === "share" ? "is-active" : ""} onClick={() => setPanel("share")}>Join & screens</button>
      </nav>

      {panel === "share" ? <SharePanel code={code} links={links} /> : ended ? (
        <section className="controller-ended">
          <h2>Session ended</h2>
          <p>Audience screens now show the session-ended message.</p>
          <div className="row-actions"><form action={startSessionForm}><input type="hidden" name="presentationId" value={doc.id} /><input type="hidden" name="fresh" value="1" /><button className="button-primary">▶ Present again</button></form><Link className="button-secondary" href={`/presentation/${doc.id}/analytics?room=${roomId}`}>View analytics</Link><Link className="button-secondary" href="/dashboard">Back to dashboard</Link></div>
        </section>
      ) : (
        <div className="controller-grid">
          <div className="controller-column">
            <section className="controller-previews">
              <div className="preview-current">
                <span className="preview-label">Current · {index + 1} / {doc.slides.length}</span>
                <SlideThumb slide={current} context={{ results, correct }} />
              </div>
              <div className="preview-next">
                <span className="preview-label">Next</span>
                {next ? <SlideThumb slide={next} /> : <div className="preview-end">End of presentation</div>}
              </div>
            </section>

            <section className="controller-nav">
              {state?.status === "ready" || state?.status === "draft" || !state ? (
                <button type="button" className="button-primary huge" disabled={!state} onClick={start}>▶ Start presentation</button>
              ) : (
                <>
                  <button type="button" className="nav-button" disabled={index === 0} onClick={() => goTo(index - 1)} aria-label="Previous slide">←<span>Previous</span></button>
                  <div className="nav-middle">
                    <b>{index + 1} / {doc.slides.length}</b>
                    {state.status === "live"
                      ? <button type="button" className="text-button" onClick={() => send({ type: "PRESENTATION_PAUSED", payload: {} })}>Pause</button>
                      : <button type="button" className="text-button" onClick={() => send({ type: "PRESENTATION_RESUMED", payload: {} })}>Resume</button>}
                  </div>
                  <button type="button" className="nav-button" disabled={index >= doc.slides.length - 1} onClick={() => goTo(index + 1)} aria-label="Next slide">→<span>Next</span></button>
                </>
              )}
            </section>

            <section className="controller-jump" aria-label="Jump to slide">
              {doc.slides.map((slide, position) => (
                <button key={slide.id} type="button" className={position === index ? "is-current" : ""} onClick={() => goTo(position)} title={slide.title}>
                  <SlideThumb slide={slide} /><span>{position + 1}</span>
                </button>
              ))}
            </section>
          </div>
          <div className="controller-column">
            <section className="controller-card controller-interaction">
              <header>
                <h3>Interaction</h3>
                {live && <span className={`tag ${live.status === "open" ? "tag-live" : ""}`}>{live.status === "open" ? "Accepting responses" : "Closed"}</span>}
              </header>
              {!interactions.length ? <p className="muted">No interaction on this slide.</p> : <>
                <div className="row-actions">
                  {live?.status === "open"
                    ? <button type="button" className="button-primary" onClick={() => send({ type: "INTERACTION_CLOSED", payload: {} })}>Close responses</button>
                    : <button type="button" className="button-primary" disabled={!live} onClick={() => send({ type: "INTERACTION_OPENED", payload: {} })}>Open responses</button>}
                  {resultsVisible
                    ? <button type="button" className="button-secondary" onClick={() => send({ type: "RESULTS_HIDDEN", payload: {} })}>Hide results</button>
                    : <button type="button" className="button-secondary" disabled={!live} onClick={() => send({ type: "RESULTS_SHOWN", payload: {} })}>Show results</button>}
                </div>
                {live?.closesAt && live.status === "open" && <p className="muted">Closes automatically when the timer ends.</p>}
                {interactions.map((item) => <ResultDetail key={item.id} item={item} aggregate={results[item.id]} />)}
                <p className="hint">“Only me” results never leave this controller. Others appear on the presentation screen when shown.</p>
              </>}
            </section>
            <section className="controller-card">
              <header><h3>Timer</h3>{countdown !== null && <b className={`timer-display${countdown <= 5 ? " is-low" : ""}`}>{formatSeconds(countdown)}</b>}</header>
              {state?.timer?.running ? (
                <button type="button" className="button-secondary" onClick={() => send({ type: "TIMER_STOPPED", payload: {} })}>Stop timer</button>
              ) : (
                <div className="timer-presets">
                  {TIMER_PRESETS.map((seconds) => <button key={seconds} type="button" className="chip" onClick={() => send({ type: "TIMER_STARTED", payload: { duration: seconds } })}>{formatSeconds(seconds)}</button>)}
                  <span className="timer-custom"><input type="number" min={1} max={3600} value={customTimer} onChange={(event) => setCustomTimer(Number(event.target.value))} aria-label="Custom seconds" /><button type="button" className="chip" onClick={() => customTimer > 0 && send({ type: "TIMER_STARTED", payload: { duration: Math.round(customTimer) } })}>Start</button></span>
                </div>
              )}
            </section>
            {current?.notes && (
              <section className="controller-card">
                <header><h3>Speaker notes</h3></header>
                <div className="notes" dangerouslySetInnerHTML={{ __html: sanitizeHtml(current.notes.replace(/\n/g, "<br>")) }} />
              </section>
            )}
          </div>
        </div>
      )}

      {confirmEnd && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="end-title">
          <div className="dialog">
            <h2 id="end-title">End presentation?</h2>
            <p>Audience members will no longer be able to interact.</p>
            <div className="row-actions">
              <button type="button" className="button-secondary" onClick={() => setConfirmEnd(false)}>Cancel</button>
              <button type="button" className="button-danger" onClick={() => { send({ type: "PRESENTATION_ENDED", payload: {} }); setConfirmEnd(false); }}>End presentation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SharePanel({ code, links }: { code: string; links: ShareLinks }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (value: string) => { void navigator.clipboard?.writeText(value); setCopied(value); setTimeout(() => setCopied(null), 1500); };
  return (
    <div className="share-grid">
      <section className="controller-card share-join">
        <h3>Audience join</h3>
        <QrCode value={links.join} className="qr-large" />
        <p className="join-code">{code}</p>
        <button type="button" className="link-copy" onClick={() => copy(links.join)}>{copied === links.join ? "Copied!" : links.join.replace(/^https?:\/\//, "")}</button>
      </section>
      <section className="controller-card">
        <h3>Presentation screen</h3>
        <p className="muted">Open this on the laptop connected to the projector. It follows this controller.</p>
        <div className="row-actions">
          <a className="button-primary" href={links.present} target="_blank" rel="noopener">Open presentation screen ↗</a>
          <button type="button" className="button-secondary" onClick={() => copy(links.present)}>{copied === links.present ? "Copied!" : "Copy link"}</button>
        </div>
      </section>
      {links.controller && (
        <section className="controller-card">
          <h3>Control from your phone</h3>
          <p className="muted">Scan to open this controller on another device. Anyone with this link can control the session — keep it private.</p>
          <QrCode value={links.controller} className="qr-medium" />
        </section>
      )}
    </div>
  );
}
