"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { slideInteractions, type PresentationDoc } from "@livo/types";
import { Logo } from "@/components/brand";
import { QrCode } from "@/components/qr";
import { SlideView, Stage } from "@/components/slide/render";
import { formatSeconds, useCountdown, useRoom } from "@/lib/use-room";

/** The projector view: clean slide, tiny LIVE badge, and nothing else unless asked (PRD §35). */
export function PresentScreen({ doc, roomId, code, token, host, joinUrl }: { doc: PresentationDoc; roomId: string; code: string; token: string; host: string; joinUrl: string }) {
  const { state, results, connection, send } = useRoom({ host, roomId, token });
  const [showJoin, setShowJoin] = useState(false);
  const [chrome, setChrome] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const countdown = useCountdown(state?.timer);

  const index = state?.currentSlideId ? Math.max(0, doc.slides.findIndex((slide) => slide.id === state.currentSlideId)) : 0;
  const slide = doc.slides[index];
  const interaction = state?.interaction?.slideId === slide?.id ? state.interaction : null;
  const correct = interaction?.status === "closed"
    ? Object.fromEntries(slideInteractions(slide).filter((item) => item.kind === "quiz" && item.config.showCorrect).map((item) => [item.id, item.kind === "quiz" ? item.config.correct : []]))
    : undefined;

  const goTo = useCallback((target: number) => {
    const next = doc.slides[target];
    if (!next || state?.status === "ended") return;
    if (state?.status === "ready") send({ type: "PRESENTATION_STARTED", payload: {} });
    send({ type: "SLIDE_CHANGED", payload: { slideId: next.id, index: target, interactions: slideInteractions(next) } });
  }, [doc.slides, send, state?.status]);

  const toggleFullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowRight": case "PageDown": case " ": event.preventDefault(); goTo(state?.currentSlideId ? index + 1 : 0); break;
        case "ArrowLeft": case "PageUp": event.preventDefault(); goTo(index - 1); break;
        case "f": case "F": toggleFullscreen(); break;
        case "j": case "J": setShowJoin((value) => !value); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index, state?.currentSlideId]);

  const wake = () => { setChrome(true); clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setChrome(false), 2500); };
  useEffect(() => { wake(); return () => clearTimeout(hideTimer.current); }, []);

  if (connection === "invalid") return <div className="present present-message"><h1>This presentation link is no longer valid.</h1></div>;
  if (state?.status === "ended") return <div className="present present-message"><Logo href={null} size={56} /><h1>Session ended.</h1><p>Thank you for participating.</p></div>;

  const waiting = !state || state.status === "ready" || state.status === "draft";

  return (
    <div className={`present${chrome ? "" : " hide-chrome"}`} onMouseMove={wake}>
      <Stage fit="contain" className="present-stage">{slide && <SlideView slide={slide} context={{ results, correct }} />}</Stage>

      {(waiting || showJoin) && (
        <div className={`join-overlay${waiting ? " is-full" : ""}`}>
          <div className="join-overlay-card">
            <QrCode value={joinUrl} className="qr-large" />
            <div>
              <p className="eyebrow">Scan to participate</p>
              <p className="join-url">Join at <b>{joinUrl.replace(/^https?:\/\//, "").replace(/\/join\/.*$/, "/join")}</b></p>
              <p className="join-code">{code}</p>
              <p className="muted">{state?.participantCount ?? 0} joined{waiting ? " · waiting for the presenter to start" : ""}</p>
            </div>
          </div>
        </div>
      )}

      {state?.status === "paused" && <div className="paused-overlay">Paused</div>}
      <div className="present-hud">
        {state?.status === "live" && <span className="live-badge"><i /> LIVE</span>}
        {countdown !== null && <span className={`hud-timer${countdown <= 5 ? " is-low" : ""}`}>{formatSeconds(countdown)}</span>}
        {connection !== "open" && <span className="hud-conn">Reconnecting…</span>}
      </div>
      <div className="present-toolbar" aria-label="Presentation controls">
        <button type="button" onClick={() => goTo(index - 1)} title="Previous (←)">←</button>
        <span>{index + 1} / {doc.slides.length}</span>
        <button type="button" onClick={() => goTo(state?.currentSlideId ? index + 1 : 0)} title="Next (→ or Space)">→</button>
        <button type="button" onClick={() => setShowJoin((value) => !value)} title="Show join QR (J)">QR</button>
        <button type="button" onClick={toggleFullscreen} title="Fullscreen (F)">⛶</button>
      </div>
    </div>
  );
}
