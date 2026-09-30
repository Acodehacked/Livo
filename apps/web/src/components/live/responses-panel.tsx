"use client";
import { useMemo, useState } from "react";
import { aggregate, describeAnswer, slideInteractions, type InteractionConfig, type LiveInteraction, type LiveResponse, type PresentationDoc } from "@livo/types";
import { ResultDetail } from "@/components/results";
import type { ResponseLog } from "@/lib/use-room";

const PAGE = 100;
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Controller-only view of every question in the deck: live summary plus each participant's answer. */
export function ResponsesPanel({ doc, log, currentSlideId, live }: { doc: PresentationDoc; log: ResponseLog; currentSlideId: string | null; live: LiveInteraction | null }) {
  const [scope, setScope] = useState<"slide" | "all">("slide");
  const [query, setQuery] = useState("");

  const items = useMemo(() => doc.slides.flatMap((slide, index) => slideInteractions(slide).filter((item) => item.kind !== "button").map((item) => ({ item, slide, index }))), [doc.slides]);
  const shown = scope === "slide" ? items.filter((entry) => entry.slide.id === currentSlideId) : items;
  const people = new Set(Object.values(log.byInteraction).flatMap((answers) => Object.keys(answers))).size;

  return (
    <div className="responses-panel">
      <div className="responses-toolbar">
        <div className="segmented" role="tablist" aria-label="Which questions">
          <button type="button" role="tab" aria-selected={scope === "slide"} className={scope === "slide" ? "is-active" : ""} onClick={() => setScope("slide")}>This slide</button>
          <button type="button" role="tab" aria-selected={scope === "all"} className={scope === "all" ? "is-active" : ""} onClick={() => setScope("all")}>All questions ({items.length})</button>
        </div>
        <input type="search" className="responses-search" placeholder="Filter by name" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Filter answers by participant name" />
        <span className="muted">{people} {people === 1 ? "person has" : "people have"} answered</span>
      </div>

      {!items.length ? <p className="muted responses-empty">This presentation has no polls, quizzes or surveys.</p>
        : !shown.length ? <p className="muted responses-empty">No question on this slide. <button type="button" className="text-button" onClick={() => setScope("all")}>Show all questions</button></p>
        : shown.map(({ item, index }) => (
          <ResponseBlock key={item.id} item={item} slideNumber={index + 1} answers={log.byInteraction[item.id]} names={log.names} query={query} open={live?.status === "open" && live.ids.includes(item.id)} />
        ))}
    </div>
  );
}

function ResponseBlock({ item, slideNumber, answers, names, query, open }: { item: InteractionConfig; slideNumber: number; answers: Record<string, LiveResponse> | undefined; names: Record<string, string>; query: string; open: boolean }) {
  const [limit, setLimit] = useState(PAGE);
  const all = useMemo(() => Object.values(answers ?? {}).sort((a, b) => b.at - a.at), [answers]);
  const summary = useMemo(() => (all.length ? aggregate(item, all.map((answer) => answer.value)) : undefined), [item, all]);
  const needle = query.trim().toLowerCase();
  const nameOf = (id: string) => names[id] || "Guest";
  const rows = needle ? all.filter((answer) => nameOf(answer.participantId).toLowerCase().includes(needle)) : all;
  const isQuiz = item.kind === "quiz";

  return (
    <section className="controller-card response-block">
      <header><h3>Slide {slideNumber}</h3>{open && <span className="tag tag-live">Accepting responses</span>}</header>
      <ResultDetail item={item} aggregate={summary} />
      <details className="answer-list" open>
        <summary>Individual answers ({needle ? `${rows.length} of ${all.length}` : all.length})</summary>
        {!rows.length ? <p className="muted">{all.length ? "No one matches that name." : "No answers yet."}</p> : (
          <table className="answer-table">
            <thead><tr><th>Name</th><th>Answer</th>{isQuiz && <th aria-label="Correct" />}<th>Time</th></tr></thead>
            <tbody>
              {rows.slice(0, limit).map((answer) => (
                <tr key={answer.participantId}>
                  <td>{nameOf(answer.participantId)}</td>
                  <td className="answer-value">{describeAnswer(item, answer.value)}</td>
                  {isQuiz && <td className={answer.correct ? "is-correct" : answer.correct === false ? "is-wrong" : ""}>{answer.correct ? "✓" : answer.correct === false ? "✗" : ""}</td>}
                  <td className="answer-time">{time(answer.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > limit && <button type="button" className="text-button" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</button>}
      </details>
    </section>
  );
}
