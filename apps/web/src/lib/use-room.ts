"use client";
import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import { CLOSE_CODES, type Aggregate, type ClientEvent, type Identity, type ResponseValue, type Reveal, type RoomState, type ServerEvent, type TimerState } from "@livo/types";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "invalid" | "full";

export interface RoomConnection {
  connection: ConnectionStatus;
  state: RoomState | null;
  you: Identity | null;
  results: Record<string, Aggregate>;
  answers: Record<string, ResponseValue>;
  reveals: Record<string, Reveal>;
  error: Extract<ServerEvent, { type: "ERROR" }>["payload"] | null;
  send: (event: ClientEvent) => void;
}

/** Connects to a live room over a reconnecting WebSocket. Every (re)connect receives SYNC_STATE, so state never depends on event history. */
export function useRoom({ host, roomId, token }: { host: string; roomId: string; token: string }): RoomConnection {
  const socket = useRef<PartySocket | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [state, setState] = useState<RoomState | null>(null);
  const [you, setYou] = useState<Identity | null>(null);
  const [results, setResults] = useState<Record<string, Aggregate>>({});
  const [answers, setAnswers] = useState<Record<string, ResponseValue>>({});
  const [reveals, setReveals] = useState<Record<string, Reveal>>({});
  const [error, setError] = useState<RoomConnection["error"]>(null);

  useEffect(() => {
    const ws = new PartySocket({ host, party: "main", room: roomId, query: { token } });
    socket.current = ws;
    let opened = false;
    ws.addEventListener("open", () => { opened = true; setConnection("open"); });
    ws.addEventListener("close", (event) => {
      if (event.code === CLOSE_CODES.invalidToken || event.code === CLOSE_CODES.full) { ws.close(); setConnection(event.code === CLOSE_CODES.full ? "full" : "invalid"); return; }
      setConnection(opened ? "reconnecting" : "connecting");
    });
    ws.addEventListener("message", (message) => {
      let event: ServerEvent;
      try { event = JSON.parse(String(message.data)); } catch { return; }
      switch (event.type) {
        case "SYNC_STATE": setState(event.payload.state); setYou(event.payload.you); setAnswers(event.payload.answers); setReveals(event.payload.reveals); setResults({}); break;
        case "STATE_UPDATED": setState(event.payload); break;
        case "RESULTS_UPDATED": setResults(event.payload); break;
        case "RESPONSE_ACCEPTED": setAnswers((current) => ({ ...current, [event.payload.interactionId]: event.payload.value })); setError(null); break;
        case "ANSWER_REVEALED": setReveals((current) => ({ ...current, ...event.payload })); break;
        case "ERROR": setError(event.payload); break;
      }
    });
    return () => { ws.close(); socket.current = null; };
  }, [host, roomId, token]);

  const send = useCallback((event: ClientEvent) => { socket.current?.send(JSON.stringify(event)); }, []);
  return { connection, state, you, results, answers, reveals, error, send };
}

/** Seconds left on a timestamp-based timer, computed locally (the server never broadcasts ticks). */
export function useCountdown(timer: TimerState | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer?.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer?.running, timer?.startedAt]);
  if (!timer?.running) return null;
  return Math.max(0, Math.ceil((timer.startedAt + timer.duration * 1000 - now) / 1000));
}

export const formatSeconds = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
