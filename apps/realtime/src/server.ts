import { routePartykitRequest, Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { z } from "zod";
import {
  aggregate, allowsChange, CLOSE_CODES, resultsOnScreen, isCorrect, PRIVILEGED_EVENTS, signRoomToken, validateResponse, verifyRoomToken,
  type Aggregate, type ClientEvent, type FlushPayload, type Identity, type InteractionConfig, type ResponseValue, type Reveal, type RoomState, type ServerEvent,
} from "@livo/types";

type Env = { Main: DurableObjectNamespace<LivoRoom>; ROOM_TOKEN_SECRET: string; WEB_ORIGIN?: string; MAX_PARTICIPANTS?: string };
type Answer = { value: ResponseValue; at: number; correct?: boolean };
type Snapshot = { state: RoomState; configs: InteractionConfig[]; closed: string[]; pending: FlushPayload["responses"]; statusDirty: boolean; quizTimer: boolean };

// Token buckets per connection; presenters navigate quickly, the audience only answers.
const RATE = { participant: { burst: 8, perSecond: 4 }, staff: { burst: 30, perSecond: 15 } };
const FLUSH_DELAY = 2_000;
const RETRY_DELAY = 10_000;
const RESULTS_THROTTLE = 250;
// Responses waiting to be written to Supabase. Live answers are stored separately, so if the web app
// is unreachable for a long time only the oldest database writes are dropped, never live results.
const MAX_PENDING = 3_000;

const envelope = z.object({ type: z.string(), payload: z.unknown().optional() });
const slideChanged = z.object({
  slideId: z.string().min(1).max(64), index: z.number().int().min(0).max(10_000),
  interactions: z.array(z.object({ id: z.string().min(1).max(64), kind: z.enum(["quiz", "poll", "rating", "slider", "open_text", "form", "button"]), config: z.record(z.unknown()) })).max(50),
});
const timerStarted = z.object({ duration: z.number().int().min(1).max(86_400) });
const respond = z.object({ interactionId: z.string().min(1).max(64), value: z.unknown() });

const blankState = (roomId: string): RoomState => ({
  roomId, presentationId: "", status: "ready", currentSlideId: null, currentSlideIndex: 0, participantCount: 0, startedAt: null, endedAt: null, timer: null, interaction: null,
});

// One Durable Object per live room, reachable at /parties/main/:roomId.
// It is the source of truth for live state; Supabase receives batched responses and status changes.
export class LivoRoom extends Server<Env> {
  // State lives in memory (snapshotted to storage), so keep the object awake while sockets are open.
  static options = { hibernate: false };

  state = blankState("");
  configs = new Map<string, InteractionConfig>();
  answers = new Map<string, Map<string, Answer>>();
  closed = new Set<string>();
  pending: FlushPayload["responses"] = [];
  statusDirty = false;
  quizTimer = false;
  dirtyAnswers = new Set<string>();
  buckets = new Map<string, { tokens: number; at: number }>();
  resultsTimer: ReturnType<typeof setTimeout> | null = null;
  countTimer: ReturnType<typeof setTimeout> | null = null;
  nextAlarm: number | null = null;

  async onStart() {
    const saved = await this.ctx.storage.get<Snapshot>("room");
    this.state = saved?.state ?? blankState(this.name);
    this.state.participantCount = 0;
    for (const config of saved?.configs ?? []) this.configs.set(config.id, config);
    this.closed = new Set(saved?.closed ?? []);
    this.pending = saved?.pending ?? [];
    this.statusDirty = saved?.statusDirty ?? false;
    this.quizTimer = saved?.quizTimer ?? false;
    const stored = await this.ctx.storage.list<Record<string, Answer>>({ prefix: "answers:" });
    for (const [key, value] of stored) this.answers.set(key.slice("answers:".length), new Map(Object.entries(value)));
    this.nextAlarm = await this.ctx.storage.getAlarm();
  }

  async onConnect(connection: Connection<Identity>, ctx: ConnectionContext) {
    const claims = await verifyRoomToken(new URL(ctx.request.url).searchParams.get("token"), this.env.ROOM_TOKEN_SECRET);
    if (!claims || claims.roomId !== this.name || claims.role === "system") { connection.close(CLOSE_CODES.invalidToken, "Invalid room token"); return; }
    if (claims.role === "participant") {
      const max = Number(this.env.MAX_PARTICIPANTS ?? 1000);
      const present = this.participantIds();
      if (!present.has(claims.participantId ?? "") && present.size >= max) { connection.close(CLOSE_CODES.full, "Room full"); return; }
    }
    connection.setState({ role: claims.role, participantId: claims.participantId, name: claims.name });
    this.state.roomId = this.name;
    if (claims.presentationId && !this.state.presentationId) this.state.presentationId = claims.presentationId;
    this.send(connection, { type: "SYNC_STATE", payload: { state: this.state, you: connection.state!, answers: this.answersFor(connection.state!), reveals: this.revealsFor(connection.state!) } });
    this.sendResultsTo(connection, this.currentResults());
    this.refreshParticipantCount();
  }

  onClose(connection: Connection<Identity>) {
    this.buckets.delete(connection.id);
    if (connection.state?.role === "participant") this.refreshParticipantCount(connection.id);
  }

  async onMessage(sender: Connection<Identity>, message: WSMessage) {
    const identity = sender.state;
    if (!identity || typeof message !== "string" || message.length > 16_384) return;
    if (!this.takeToken(sender.id, identity.role === "participant" ? RATE.participant : RATE.staff)) { this.send(sender, { type: "ERROR", payload: { code: "rate_limited", message: "Slow down a little." } }); return; }
    let parsed: z.infer<typeof envelope>;
    try { parsed = envelope.parse(JSON.parse(message)); } catch { return; }
    const type = parsed.type as ClientEvent["type"];
    if (PRIVILEGED_EVENTS.has(type) && identity.role === "participant") { this.send(sender, { type: "ERROR", payload: { code: "forbidden", message: "Only the presenter can do that." } }); return; }
    try {
      switch (type) {
        case "SLIDE_CHANGED": this.changeSlide(slideChanged.parse(parsed.payload)); break;
        case "PRESENTATION_STARTED": this.setStatus("live"); break;
        case "PRESENTATION_PAUSED": if (this.state.status === "live") this.setStatus("paused"); break;
        case "PRESENTATION_RESUMED": if (this.state.status === "paused") this.setStatus("live"); break;
        case "PRESENTATION_ENDED": this.end(); break;
        case "TIMER_STARTED": this.quizTimer = false; this.state.timer = { startedAt: Date.now(), duration: timerStarted.parse(parsed.payload).duration, running: true }; this.commit(); break;
        case "TIMER_STOPPED": this.quizTimer = false; this.state.timer = null; this.commit(); break;
        case "INTERACTION_OPENED": this.openInteraction(); break;
        case "INTERACTION_CLOSED": this.closeInteraction(); break;
        case "RESULTS_SHOWN": case "RESULTS_HIDDEN":
          if (this.state.interaction) { this.state.interaction.resultsShown = type === "RESULTS_SHOWN"; this.commit(); this.broadcastResults(); }
          break;
        case "RESPOND": this.respond(sender, respond.parse(parsed.payload) as { interactionId: string; value: unknown }); break;
      }
    } catch {
      this.send(sender, { type: "ERROR", payload: { code: "invalid", message: "That request was not valid." } });
    }
  }

  // Lightweight state for health checks and load tests: GET /parties/main/:roomId
  // With a system token it instead returns every stored answer, so the web app can pull what the
  // flush couldn't push (e.g. WEB_ORIGIN unreachable). Same shape as a flush; upserts make it idempotent.
  async onRequest(request: Request) {
    const auth = request.headers.get("authorization");
    if (auth) {
      const claims = await verifyRoomToken(auth.replace(/^Bearer\s+/i, ""), this.env.ROOM_TOKEN_SECRET);
      if (!claims || claims.role !== "system" || claims.roomId !== this.name) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const { status, startedAt, endedAt } = this.state;
      const responses = [...this.answers].flatMap(([interactionId, answers]) => [...answers].map(([participantId, answer]) => ({ interactionId, participantId, ...answer })));
      // A room that never started has nothing to say about status; don't overwrite the database with "ready".
      return Response.json({ roomId: this.name, status: status === "ready" ? undefined : { status, startedAt, endedAt }, responses } satisfies FlushPayload);
    }
    const { status, participantCount, currentSlideIndex } = this.state;
    return Response.json({ status, participantCount, currentSlideIndex, connections: [...this.getConnections()].length });
  }

  async onAlarm() {
    this.nextAlarm = null;
    const interaction = this.state.interaction;
    if (interaction?.status === "open" && interaction.closesAt && interaction.closesAt <= Date.now()) this.closeInteraction();
    await this.persist();
    const flushed = await this.flush();
    if (!flushed) this.scheduleAlarm(Date.now() + RETRY_DELAY);
    else if (this.pending.length || this.statusDirty) this.scheduleAlarm(Date.now() + FLUSH_DELAY);
    if (this.state.interaction?.status === "open" && this.state.interaction.closesAt) this.scheduleAlarm(this.state.interaction.closesAt);
  }

  // --- presenter actions -----------------------------------------------------

  private changeSlide(payload: z.infer<typeof slideChanged>) {
    if (this.state.status === "ended") return;
    this.state.currentSlideId = payload.slideId;
    this.state.currentSlideIndex = payload.index;
    for (const item of payload.interactions) this.configs.set(item.id, item as unknown as InteractionConfig);
    if (this.quizTimer) { this.state.timer = null; this.quizTimer = false; }
    const ids = payload.interactions.map((item) => item.id);
    if (!ids.length) { this.state.interaction = null; this.commit(); this.broadcastResults(); return; }
    const reviewing = ids.every((id) => this.closed.has(id));
    this.state.interaction = {
      slideId: payload.slideId, ids, status: reviewing ? "closed" : "open", closesAt: null,
      resultsShown: reviewing ? true : null,
    };
    if (!reviewing) this.startQuizTimer();
    this.commit();
    this.broadcastResults();
    if (reviewing) this.broadcastReveals();
  }

  private openInteraction() {
    const interaction = this.state.interaction;
    if (!interaction || this.state.status === "ended") return;
    interaction.status = "open";
    interaction.ids.forEach((id) => this.closed.delete(id));
    this.startQuizTimer();
    this.commit();
    this.broadcastResults();
  }

  private closeInteraction() {
    const interaction = this.state.interaction;
    if (!interaction || interaction.status === "closed") return;
    interaction.status = "closed";
    interaction.closesAt = null;
    interaction.ids.forEach((id) => this.closed.add(id));
    if (this.quizTimer) { this.state.timer = null; this.quizTimer = false; }
    this.commit();
    this.broadcastResults();
    this.broadcastReveals();
  }

  /** Timed quizzes close themselves; the room alarm enforces it even if every controller disconnects. */
  private startQuizTimer() {
    const interaction = this.state.interaction!;
    const limit = Math.max(0, ...interaction.ids.map((id) => { const item = this.configs.get(id); return item?.kind === "quiz" ? item.config.timeLimit || 0 : 0; }));
    if (!limit) { interaction.closesAt = null; return; }
    const now = Date.now();
    interaction.closesAt = now + limit * 1000;
    this.state.timer = { startedAt: now, duration: limit, running: true };
    this.quizTimer = true;
    this.scheduleAlarm(interaction.closesAt);
  }

  private setStatus(status: "live" | "paused") {
    if (this.state.status === "ended") return;
    this.state.status = status;
    if (status === "live") this.state.startedAt ??= Date.now();
    this.statusDirty = true;
    this.commit();
    this.scheduleAlarm(Date.now() + 500);
  }

  private end() {
    if (this.state.status === "ended") return;
    this.closeInteraction();
    Object.assign(this.state, { status: "ended", endedAt: Date.now(), timer: null });
    this.statusDirty = true;
    this.commit();
    this.scheduleAlarm(Date.now() + 100);
  }

  // --- audience responses ----------------------------------------------------

  private respond(sender: Connection<Identity>, payload: { interactionId: string; value: unknown }) {
    const identity = sender.state!;
    const reject = (code: "forbidden" | "invalid" | "closed" | "already_answered", message: string) => this.send(sender, { type: "ERROR", payload: { code, message, interactionId: payload.interactionId } });
    if (identity.role !== "participant" || !identity.participantId) return reject("forbidden", "Only audience members can respond.");
    const interaction = this.state.interaction;
    const open = this.state.status === "live" && interaction?.status === "open" && interaction.ids.includes(payload.interactionId) && (!interaction.closesAt || interaction.closesAt > Date.now());
    if (!open) return reject("closed", "Responses are closed.");
    const item = this.configs.get(payload.interactionId);
    const value = item && validateResponse(item, payload.value);
    if (!item || value === null || value === undefined) return reject("invalid", "That answer isn't valid.");
    let answers = this.answers.get(item.id);
    if (!answers) { answers = new Map(); this.answers.set(item.id, answers); }
    if (answers.has(identity.participantId) && !allowsChange(item)) return reject("already_answered", "You've already answered.");
    const answer: Answer = { value, at: Date.now(), correct: isCorrect(item, value) };
    answers.set(identity.participantId, answer);
    this.dirtyAnswers.add(item.id);
    if (this.env.WEB_ORIGIN) {
      this.pending.push({ interactionId: item.id, participantId: identity.participantId, ...answer });
      if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
    }
    this.send(sender, { type: "RESPONSE_ACCEPTED", payload: { interactionId: item.id, value } });
    this.scheduleResults();
    this.scheduleAlarm(Date.now() + FLUSH_DELAY);
  }

  // --- results & reveals, filtered per role ------------------------------------

  private currentResults(): Record<string, Aggregate> {
    const results: Record<string, Aggregate> = {};
    for (const id of this.state.interaction?.ids ?? []) {
      const item = this.configs.get(id);
      if (item) results[id] = aggregate(item, [...(this.answers.get(id)?.values() ?? [])].map((answer) => answer.value));
    }
    return results;
  }

  /** Admin sees everything; the projector sees public results when shown; the audience only after close. */
  private visibleTo(identity: Identity, id: string) {
    const interaction = this.state.interaction;
    if (identity.role === "admin") return true;
    if (!interaction || !resultsOnScreen(interaction, this.configs.get(id)?.config.results)) return false;
    return identity.role === "presenter" || interaction.status === "closed";
  }

  private sendResultsTo(connection: Connection<Identity>, results: Record<string, Aggregate>) {
    const identity = connection.state;
    if (!identity) return;
    const visible = Object.fromEntries(Object.entries(results).filter(([id]) => this.visibleTo(identity, id)));
    if (Object.keys(visible).length || identity.role !== "participant") this.send(connection, { type: "RESULTS_UPDATED", payload: visible });
  }

  private broadcastResults() {
    if (this.resultsTimer) { clearTimeout(this.resultsTimer); this.resultsTimer = null; }
    const results = this.currentResults();
    for (const connection of this.getConnections<Identity>()) this.sendResultsTo(connection, results);
  }

  private scheduleResults() {
    this.resultsTimer ??= setTimeout(() => this.broadcastResults(), RESULTS_THROTTLE);
  }

  private revealsFor(identity: Identity): Record<string, Reveal> {
    const interaction = this.state.interaction;
    if (!interaction || interaction.status !== "closed") return {};
    const reveals: Record<string, Reveal> = {};
    for (const id of interaction.ids) {
      const item = this.configs.get(id);
      if (item?.kind !== "quiz" || !item.config.showCorrect || !item.config.correct.length) continue;
      const yours = identity.participantId ? this.answers.get(id)?.get(identity.participantId)?.correct : undefined;
      reveals[id] = { correct: item.config.correct, explanation: item.config.explanation, yours };
    }
    return reveals;
  }

  private broadcastReveals() {
    for (const connection of this.getConnections<Identity>()) {
      const reveals = connection.state ? this.revealsFor(connection.state) : {};
      if (Object.keys(reveals).length) this.send(connection, { type: "ANSWER_REVEALED", payload: reveals });
    }
  }

  private answersFor(identity: Identity): Record<string, ResponseValue> {
    if (!identity.participantId) return {};
    const answers: Record<string, ResponseValue> = {};
    for (const [id, byParticipant] of this.answers) {
      const answer = byParticipant.get(identity.participantId);
      if (answer) answers[id] = answer.value;
    }
    return answers;
  }

  // --- plumbing ---------------------------------------------------------------

  private participantIds(excludeConnection?: string) {
    const ids = new Set<string>();
    for (const connection of this.getConnections<Identity>()) {
      if (connection.id !== excludeConnection && connection.state?.role === "participant" && connection.state.participantId) ids.add(connection.state.participantId);
    }
    return ids;
  }

  /**
   * Join/leave only changes the count, which only the controller and projector display. Sending it to
   * every audience device on every join is O(n²) as a room fills, so it goes to staff, at most twice a second.
   */
  private refreshParticipantCount(excludeConnection?: string) {
    const count = this.participantIds(excludeConnection).size;
    if (count === this.state.participantCount) return;
    this.state.participantCount = count;
    this.countTimer ??= setTimeout(() => {
      this.countTimer = null;
      const message = JSON.stringify({ type: "STATE_UPDATED", payload: this.state } satisfies ServerEvent);
      for (const connection of this.getConnections<Identity>()) if (connection.state && connection.state.role !== "participant") connection.send(message);
    }, 500);
  }

  /** Broadcast the new state and snapshot it so a restarted room resumes where it was. */
  private commit() {
    this.broadcast(JSON.stringify({ type: "STATE_UPDATED", payload: this.state } satisfies ServerEvent));
    void this.persist();
  }

  private async persist() {
    const snapshot: Snapshot = { state: this.state, configs: [...this.configs.values()], closed: [...this.closed], pending: this.pending, statusDirty: this.statusDirty, quizTimer: this.quizTimer };
    const dirty = [...this.dirtyAnswers];
    this.dirtyAnswers.clear();
    try {
      // allowUnconfirmed: don't hold outgoing messages (the output gate) until the snapshot is on disk;
      // live state must reach screens immediately, and the snapshot is only for restarts.
      await this.ctx.storage.put({ room: snapshot, ...Object.fromEntries(dirty.map((id) => [`answers:${id}`, Object.fromEntries(this.answers.get(id) ?? [])])) }, { allowUnconfirmed: true });
    } catch (error) {
      dirty.forEach((id) => this.dirtyAnswers.add(id)); // retry on the next persist
      console.error("persist failed", error);
    }
  }

  /** Posts pending responses and status changes to the web app. Returns false if it should retry. */
  private async flush(): Promise<boolean> {
    if (!this.env.WEB_ORIGIN || (!this.pending.length && !this.statusDirty)) return true;
    const responses = this.pending.slice(0, 500);
    const { status, startedAt, endedAt } = this.state;
    const body: FlushPayload = { roomId: this.name, responses, status: this.statusDirty ? { status, startedAt, endedAt } : undefined };
    try {
      const token = await signRoomToken({ roomId: this.name, role: "system", exp: Math.floor(Date.now() / 1000) + 60 }, this.env.ROOM_TOKEN_SECRET);
      const response = await fetch(new URL("/api/realtime/flush", this.env.WEB_ORIGIN), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`flush failed: ${response.status}`);
      this.pending.splice(0, responses.length);
      if (body.status) this.statusDirty = false;
      await this.persist();
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  private scheduleAlarm(at: number) {
    if (this.nextAlarm !== null && this.nextAlarm <= at) return;
    this.nextAlarm = at;
    void this.ctx.storage.setAlarm(at);
  }

  private takeToken(connectionId: string, limit: { burst: number; perSecond: number }) {
    const now = Date.now();
    const bucket = this.buckets.get(connectionId) ?? { tokens: limit.burst, at: now };
    bucket.tokens = Math.min(limit.burst, bucket.tokens + ((now - bucket.at) / 1000) * limit.perSecond);
    bucket.at = now;
    this.buckets.set(connectionId, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  private send(connection: Connection, event: ServerEvent) {
    connection.send(JSON.stringify(event));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routePartykitRequest(request, env, { cors: true })) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
