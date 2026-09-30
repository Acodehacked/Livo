import "server-only";
import { aggregate, choiceOptions, interactionOf, type Aggregate, type InteractionConfig, type PresentationDoc, type ResponseValue } from "@livo/types";

export type ResponseRow = { interaction_id: string; participant_id: string; response: ResponseValue; correct: boolean | null; created_at: string };
export type ParticipantRow = { id: string; display_name: string | null; joined_at: string };

export interface SessionAnalytics {
  participants: number;
  responses: number;
  completion: number | null;      // share of participants who answered every interaction that was used
  quizAccuracy: number | null;
  averageRating: number | null;   // normalised to /5
  interactionRate: number | null; // share of participants who answered at least once
  items: { item: InteractionConfig; slideIndex: number; aggregate: Aggregate; responses: number }[];
  leaderboard: { name: string; points: number; correct: number }[];
  people: { name: string; joinedAt: string; responses: number }[];
}

export function interactionsOf(doc: PresentationDoc) {
  return doc.slides.flatMap((slide, slideIndex) => slide.elements.map(interactionOf).filter((item): item is InteractionConfig => item !== null).map((item) => ({ item, slideIndex })));
}

export function analyse(doc: PresentationDoc, participants: ParticipantRow[], responses: ResponseRow[]): SessionAnalytics {
  const byInteraction = new Map<string, ResponseRow[]>();
  for (const row of responses) byInteraction.set(row.interaction_id, [...(byInteraction.get(row.interaction_id) ?? []), row]);
  const items = interactionsOf(doc).map(({ item, slideIndex }) => {
    const rows = [...(byInteraction.get(item.id) ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { item, slideIndex, aggregate: aggregate(item, rows.map((row) => row.response)), responses: rows.length };
  });
  const used = items.filter((entry) => entry.responses > 0);
  const answeredBy = new Map<string, Set<string>>();
  for (const row of responses) answeredBy.set(row.participant_id, (answeredBy.get(row.participant_id) ?? new Set()).add(row.interaction_id));

  const scored = responses.filter((row) => row.correct !== null);
  const ratings = items.filter((entry) => entry.item.kind === "rating").flatMap((entry) => (byInteraction.get(entry.item.id) ?? []).map((row) => (Number(row.response) / (entry.item.kind === "rating" ? entry.item.config.max : 5)) * 5)).filter(Number.isFinite);

  const points = new Map<string, number>(), correctCount = new Map<string, number>();
  const quizPoints = new Map(items.filter((entry) => entry.item.kind === "quiz").map((entry) => [entry.item.id, entry.item.kind === "quiz" ? entry.item.config.points : 0]));
  for (const row of responses) if (row.correct) {
    points.set(row.participant_id, (points.get(row.participant_id) ?? 0) + (quizPoints.get(row.interaction_id) ?? 0));
    correctCount.set(row.participant_id, (correctCount.get(row.participant_id) ?? 0) + 1);
  }
  const names = new Map(participants.map((person) => [person.id, person.display_name || "Guest"]));
  const count = participants.length;

  return {
    participants: count,
    responses: responses.length,
    completion: count && used.length ? participants.filter((person) => used.every((entry) => answeredBy.get(person.id)?.has(entry.item.id))).length / count : null,
    quizAccuracy: scored.length ? scored.filter((row) => row.correct).length / scored.length : null,
    averageRating: ratings.length ? ratings.reduce((total, value) => total + value, 0) / ratings.length : null,
    interactionRate: count ? participants.filter((person) => answeredBy.has(person.id)).length / count : null,
    items,
    leaderboard: [...points.entries()].map(([id, total]) => ({ name: names.get(id) ?? "Guest", points: total, correct: correctCount.get(id) ?? 0 })).sort((a, b) => b.points - a.points).slice(0, 10),
    people: participants.map((person) => ({ name: person.display_name || "Guest", joinedAt: person.joined_at, responses: answeredBy.get(person.id)?.size ?? 0 })),
  };
}
