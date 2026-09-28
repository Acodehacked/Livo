// Protocol checks + load test for the Livo room server (PRD Phase 15).
//
//   node scripts/load-test.mjs [--host localhost:1999] [--sizes 10,50,100] [--checks-only]
//
// Needs ROOM_TOKEN_SECRET in the environment (same value as .dev.vars). Start the server first
// with `npx wrangler dev --var WEB_ORIGIN:` so it doesn't try to persist to the web app.
import { createHmac, randomUUID } from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg, i, all) => arg.startsWith("--") ? [arg.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]] : null).filter(Boolean));
const HOST = args.host ?? "localhost:1999";
const SECRET = process.env.ROOM_TOKEN_SECRET;
if (!SECRET) { console.error("Set ROOM_TOKEN_SECRET"); process.exit(1); }
const SIZES = String(args.sizes ?? "10,50,100").split(",").map(Number);

const b64 = (value) => Buffer.from(value).toString("base64url");
const sign = (claims) => { const body = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims }))}`; return `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Client {
  constructor(roomId, claims, label) {
    this.label = label; this.messages = []; this.waiters = [];
    this.ws = new WebSocket(`ws://${HOST}/parties/main/${roomId}?token=${claims ? sign({ roomId, ...claims }) : "nope"}`);
    this.opened = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.closed = new Promise((resolve) => { this.ws.onclose = (event) => resolve(event.code); });
    this.ws.onmessage = (event) => { const message = JSON.parse(event.data); message.at = performance.now(); this.messages.push(message); this.waiters = this.waiters.filter((waiter) => !waiter(message)); };
  }
  send(type, payload = {}) { this.ws.send(JSON.stringify({ type, payload })); }
  /** Resolves with the first message (already received or future) matching the predicate. */
  wait(predicate, timeout = 5000, fromIndex = 0) {
    const existing = this.messages.slice(fromIndex).find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.label}: timed out waiting`)), timeout);
      this.waiters.push((message) => { if (!predicate(message)) return false; clearTimeout(timer); resolve(message); return true; });
    });
  }
  last(type) { return [...this.messages].reverse().find((message) => message.type === type); }
  close() { this.ws.close(); }
}

const quiz = (id, extra = {}) => ({ id, kind: "quiz", config: { question: "2 + 2?", mode: "single", options: [{ id: "a", label: "3" }, { id: "b", label: "4" }], correct: ["b"], points: 100, timeLimit: 0, required: false, results: "live", explanation: "Basic maths.", showCorrect: true, randomize: false, allowRetry: false, ...extra } });
const survey = (id) => ({ id, kind: "rating", config: { question: "Rate", max: 5, icon: "star", allowHalf: false, required: false, results: "admin_only", allowChange: true } });

let failures = 0;
const check = (name, condition, detail = "") => { console.log(`${condition ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`); if (!condition) failures++; };

async function protocolChecks() {
  console.log("\n# Protocol checks");
  const roomId = randomUUID();
  const bad = new Client(roomId, null, "bad");
  check("Invalid token is rejected with 4001", (await bad.closed) === 4001);

  const admin = new Client(roomId, { role: "admin", presentationId: "p1" }, "admin");
  const screen = new Client(roomId, { role: "presenter" }, "screen");
  const alice = new Client(roomId, { role: "participant", participantId: "alice", name: "Alice" }, "alice");
  const bob = new Client(roomId, { role: "participant", participantId: "bob", name: "Bob" }, "bob");
  await Promise.all([admin, screen, alice, bob].map((client) => client.opened));
  const sync = await alice.wait((m) => m.type === "SYNC_STATE");
  check("Participant receives SYNC_STATE on connect", sync.payload.state.status === "ready");
  await admin.wait((m) => m.type === "STATE_UPDATED" && m.payload.participantCount === 2);
  check("Participant count tracks distinct participants", true);
  await sleep(700);
  check("Join/leave counts go to staff only", alice.messages.every((m) => m.type !== "STATE_UPDATED"));

  alice.send("SLIDE_CHANGED", { slideId: "s1", index: 0, interactions: [] });
  check("Participants cannot change slides", (await alice.wait((m) => m.type === "ERROR")).payload.code === "forbidden");

  admin.send("PRESENTATION_STARTED");
  admin.send("SLIDE_CHANGED", { slideId: "s2", index: 1, interactions: [quiz("q1"), survey("r1")] });
  const state = await bob.wait((m) => m.type === "STATE_UPDATED" && m.payload.currentSlideId === "s2" && m.payload.interaction?.status === "open");
  check("Slide change + open interaction reach the audience", state.payload.status === "live");

  alice.send("RESPOND", { interactionId: "q1", value: "b" });
  bob.send("RESPOND", { interactionId: "q1", value: "a" });
  alice.send("RESPOND", { interactionId: "r1", value: 5 });
  check("Response accepted", !!(await alice.wait((m) => m.type === "RESPONSE_ACCEPTED" && m.payload.interactionId === "q1")));
  alice.send("RESPOND", { interactionId: "q1", value: "a" });
  check("Quiz answers can't be changed without allowRetry", (await alice.wait((m) => m.type === "ERROR" && m.payload.code === "already_answered")).payload.interactionId === "q1");
  bob.send("RESPOND", { interactionId: "r1", value: 9 });
  check("Out-of-range rating rejected", !!(await bob.wait((m) => m.type === "ERROR" && m.payload.code === "invalid")));

  const adminResults = await admin.wait((m) => m.type === "RESULTS_UPDATED" && m.payload.q1?.total === 2 && m.payload.r1?.total === 1);
  check("Admin sees quiz results with correct count", adminResults.payload.q1.correct === 1 && adminResults.payload.q1.counts.b === 1);
  check("Admin sees admin-only survey results", adminResults.payload.r1.average === 5);
  const screenResults = await screen.wait((m) => m.type === "RESULTS_UPDATED" && m.payload.q1?.total === 2);
  check("Presentation screen gets live quiz results", screenResults.payload.q1.total === 2);
  check("Presentation screen never gets admin-only results", screen.messages.every((m) => m.type !== "RESULTS_UPDATED" || !m.payload.r1));
  check("Audience gets no results while the quiz is open", alice.messages.every((m) => m.type !== "RESULTS_UPDATED"));

  admin.send("INTERACTION_CLOSED");
  const reveal = await alice.wait((m) => m.type === "ANSWER_REVEALED");
  const bobReveal = await bob.wait((m) => m.type === "ANSWER_REVEALED");
  check("Closing reveals the correct answer per participant", reveal.payload.q1.yours === true && bobReveal.payload.q1.yours === false && reveal.payload.q1.explanation === "Basic maths.");
  const aliceResults = await alice.wait((m) => m.type === "RESULTS_UPDATED");
  check("Audience sees public results after close, never admin-only", !!aliceResults.payload.q1 && !aliceResults.payload.r1);
  bob.send("RESPOND", { interactionId: "r1", value: 3 });
  check("Responses rejected after close", (await bob.wait((m) => m.type === "ERROR" && m.payload.code === "closed")).payload.interactionId === "r1");

  // Reconnect: state comes back from the room, including the participant's own answers.
  alice.close();
  const again = new Client(roomId, { role: "participant", participantId: "alice", name: "Alice" }, "alice2");
  const resync = await again.wait((m) => m.type === "SYNC_STATE");
  check("Reconnect restores current slide and own answers", resync.payload.state.currentSlideId === "s2" && resync.payload.answers.q1 === "b" && resync.payload.reveals.q1?.yours === true);

  // Timed quiz closes itself via the room alarm even with no controller action.
  admin.send("SLIDE_CHANGED", { slideId: "s3", index: 2, interactions: [quiz("q2", { timeLimit: 2 })] });
  const timed = await again.wait((m) => m.type === "STATE_UPDATED" && m.payload.currentSlideId === "s3");
  check("Timed quiz starts a timestamp-based timer", timed.payload.timer?.duration === 2 && !!timed.payload.interaction.closesAt);
  const autoClosed = await again.wait((m) => m.type === "STATE_UPDATED" && m.payload.currentSlideId === "s3" && m.payload.interaction?.status === "closed", 6000);
  check("Timed quiz auto-closes on the server", !!autoClosed);

  // Rate limiting: a burst of 30 messages from one participant.
  for (let i = 0; i < 30; i++) bob.send("RESPOND", { interactionId: "nope", value: 1 });
  check("Participant bursts are rate limited", !!(await bob.wait((m) => m.type === "ERROR" && m.payload.code === "rate_limited")));

  admin.send("PRESENTATION_ENDED");
  check("End session reaches everyone", (await bob.wait((m) => m.type === "STATE_UPDATED" && m.payload.status === "ended")).payload.endedAt > 0);
  for (const client of [admin, screen, bob, again]) client.close();
}

async function loadStage(size) {
  const roomId = randomUUID();
  const started = performance.now();
  const admin = new Client(roomId, { role: "admin", presentationId: "p" }, "admin");
  await admin.opened;
  // Connect in waves of 50, like an audience scanning a QR code, rather than one thundering herd.
  const people = [];
  for (let i = 0; i < size; i += 50) {
    const wave = Array.from({ length: Math.min(50, size - i) }, (_, j) => new Client(roomId, { role: "participant", participantId: `p${i + j}`, name: `P${i + j}` }, `p${i + j}`));
    people.push(...wave);
    await Promise.all(wave.map((client) => client.opened));
  }
  await admin.wait((m) => m.type === "STATE_UPDATED" && m.payload.participantCount === size, 30_000);
  const connectMs = performance.now() - started;

  admin.send("PRESENTATION_STARTED");
  const marks = people.map((client) => client.messages.length);
  const sent = performance.now();
  admin.send("SLIDE_CHANGED", { slideId: "quiz", index: 1, interactions: [quiz("lq")] });
  const arrivals = await Promise.all(people.map((client, i) => client.wait((m) => m.type === "STATE_UPDATED" && m.payload.currentSlideId === "quiz", 30_000, marks[i]).then((m) => m.at - sent)));
  arrivals.sort((a, b) => a - b);

  const answerStart = performance.now();
  people.forEach((client, i) => client.send("RESPOND", { interactionId: "lq", value: i % 3 ? "b" : "a" }));
  const acks = await Promise.all(people.map((client) => client.wait((m) => m.type === "RESPONSE_ACCEPTED", 30_000).then((m) => m.at - answerStart)));
  acks.sort((a, b) => a - b);
  await admin.wait((m) => m.type === "RESULTS_UPDATED" && m.payload.lq?.total === size, 30_000);
  const resultsMs = performance.now() - answerStart;
  const received = people.reduce((total, client) => total + client.messages.length, 0) + admin.messages.length;

  const pct = (list, p) => list[Math.min(list.length - 1, Math.floor(list.length * p))].toFixed(0);
  console.log(`${String(size).padStart(5)} | connect ${connectMs.toFixed(0).padStart(6)} ms | slide sync p50 ${pct(arrivals, 0.5).padStart(4)} / p95 ${pct(arrivals, 0.95).padStart(4)} ms | answer ack p50 ${pct(acks, 0.5).padStart(4)} / p95 ${pct(acks, 0.95).padStart(4)} ms | all results ${resultsMs.toFixed(0).padStart(5)} ms | ${received} msgs`);
  for (const client of [admin, ...people]) client.close();
  await sleep(300);
}

if (!args["load-only"]) await protocolChecks();
if (!args["checks-only"]) {
  console.log("\n# Load test (single machine — numbers include client overhead)\n size | timings");
  for (const size of SIZES) {
    try { await loadStage(size); } catch (error) { console.log(`${String(size).padStart(5)} | FAILED: ${error.message ?? error.type ?? error}`); failures++; break; }
  }
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
