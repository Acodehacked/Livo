// Live room protocol. The realtime server owns RoomState; clients already hold the
// presentation document, so events carry ids, never slide content.
import type { InteractionConfig, RoomRole, RoomStatus } from "./model";
import type { Aggregate, ResponseValue } from "./responses";

export interface TimerState { startedAt: number; duration: number; running: boolean }

export interface LiveInteraction {
  slideId: string;
  ids: string[];
  status: "open" | "closed";
  closesAt: number | null;   // epoch ms, set for timed quizzes
  resultsShown: boolean | null; // controller override; null = each element's own visibility ("live" shows, "on_reveal" waits)
}

export interface RoomState {
  roomId: string;
  presentationId: string;
  status: RoomStatus;
  currentSlideId: string | null;
  currentSlideIndex: number;
  participantCount: number;
  startedAt: number | null;
  endedAt: number | null;
  timer: TimerState | null;
  interaction: LiveInteraction | null;
}

/** Whether results for one element are on screen, given the controller override. */
export const resultsOnScreen = (interaction: LiveInteraction, visibility: "live" | "on_reveal" | "admin_only" | undefined) =>
  visibility !== "admin_only" && (interaction.resultsShown ?? visibility === "live");

export interface Reveal { correct: string[]; explanation: string; yours?: boolean }
export interface Identity { role: RoomRole; participantId?: string; name?: string }

/** Events devices send to the room. Everything except RESPOND requires admin or presenter. */
export type ClientEvent =
  | { type: "SLIDE_CHANGED"; payload: { slideId: string; index: number; interactions: InteractionConfig[] } }
  | { type: "PRESENTATION_STARTED"; payload: Record<string, never> }
  | { type: "PRESENTATION_PAUSED"; payload: Record<string, never> }
  | { type: "PRESENTATION_RESUMED"; payload: Record<string, never> }
  | { type: "PRESENTATION_ENDED"; payload: Record<string, never> }
  | { type: "TIMER_STARTED"; payload: { duration: number } }
  | { type: "TIMER_STOPPED"; payload: Record<string, never> }
  | { type: "INTERACTION_OPENED"; payload: Record<string, never> }
  | { type: "INTERACTION_CLOSED"; payload: Record<string, never> }
  | { type: "RESULTS_SHOWN"; payload: Record<string, never> }
  | { type: "RESULTS_HIDDEN"; payload: Record<string, never> }
  | { type: "RESPOND"; payload: { interactionId: string; value: ResponseValue } };

export const PRIVILEGED_EVENTS = new Set<ClientEvent["type"]>([
  "SLIDE_CHANGED", "PRESENTATION_STARTED", "PRESENTATION_PAUSED", "PRESENTATION_RESUMED", "PRESENTATION_ENDED",
  "TIMER_STARTED", "TIMER_STOPPED", "INTERACTION_OPENED", "INTERACTION_CLOSED", "RESULTS_SHOWN", "RESULTS_HIDDEN",
]);

/** One participant's current answer to one interaction. Also the unit of persistence (FlushPayload). */
export interface LiveResponse { interactionId: string; participantId: string; value: ResponseValue; correct?: boolean; at: number }

/** Events the room sends. RESULTS_UPDATED and ANSWER_REVEALED are filtered per role before sending. */
export type ServerEvent =
  | { type: "SYNC_STATE"; payload: { state: RoomState; you: Identity; answers: Record<string, ResponseValue>; reveals: Record<string, Reveal> } }
  | { type: "STATE_UPDATED"; payload: RoomState }
  | { type: "RESULTS_UPDATED"; payload: Record<string, Aggregate> }
  | { type: "RESPONSE_ACCEPTED"; payload: { interactionId: string; value: ResponseValue } }
  | { type: "ANSWER_REVEALED"; payload: Record<string, Reveal> }
  // Controller (admin) only: individual answers with names. SYNC chunks arrive on connect, the first with reset.
  | { type: "RESPONSES_SYNC"; payload: { reset: boolean; names: Record<string, string>; responses: LiveResponse[] } }
  | { type: "RESPONSE_RECORDED"; payload: LiveResponse & { name: string } }
  | { type: "ERROR"; payload: { code: "forbidden" | "invalid" | "closed" | "already_answered" | "rate_limited"; message: string; interactionId?: string } };

/** WebSocket close codes the room uses so clients can show the right error screen. */
export const CLOSE_CODES = { invalidToken: 4001, ended: 4002, full: 4003 } as const;

/** Batch the realtime server posts to the web app for persistence. */
export interface FlushPayload {
  roomId: string;
  status?: { status: RoomStatus; startedAt: number | null; endedAt: number | null };
  responses: LiveResponse[];
}
