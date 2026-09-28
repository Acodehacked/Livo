"use client";
import { choiceOptions, interactionTitle, YES_NO, type Aggregate, type ChoiceOption, type FormField, type InteractionConfig } from "@livo/types";
import { ChoiceBars } from "@/components/slide/render";

const KIND_LABEL: Record<InteractionConfig["kind"], string> = { quiz: "Quiz", poll: "Poll", rating: "Rating", slider: "Slider", open_text: "Open text", form: "Form", button: "Button" };
const pct = (value: number, total: number) => (total ? Math.round((value / total) * 100) : 0);

/** Detailed, admin-only view of one interaction's results (controller and analytics). */
export function ResultDetail({ item, aggregate }: { item: InteractionConfig; aggregate: Aggregate | undefined }) {
  const total = aggregate && "total" in aggregate ? aggregate.total : 0;
  return (
    <section className="result-detail">
      <header>
        <span className="tag">{KIND_LABEL[item.kind]}</span>
        <h4>{interactionTitle(item) || "Untitled"}</h4>
        <span className="result-total">{total} {total === 1 ? "response" : "responses"}</span>
      </header>
      {aggregate?.kind === "choice" && aggregate.correct !== undefined && total > 0 && <p className="result-accuracy"><b>{pct(aggregate.correct, total)}%</b> answered correctly</p>}
      <AggregateView aggregate={aggregate} options={item.kind === "quiz" || item.kind === "poll" ? choiceOptions(item.config) : undefined} correct={item.kind === "quiz" ? item.config.correct : undefined} fields={item.kind === "form" ? item.config.fields : undefined} max={item.kind === "rating" ? item.config.max : item.kind === "slider" ? item.config.max : undefined} min={item.kind === "slider" ? item.config.min : 1} />
    </section>
  );
}

function AggregateView({ aggregate, options, correct, fields, max, min }: { aggregate?: Aggregate; options?: ChoiceOption[]; correct?: string[]; fields?: FormField[]; max?: number; min?: number }) {
  if (!aggregate) return <p className="muted">Waiting for responses…</p>;
  switch (aggregate.kind) {
    case "choice": return <ChoiceBars options={options ?? []} aggregate={aggregate} correct={correct} accent="#4f7bff" />;
    case "numeric": return <Histogram aggregate={aggregate} max={max} min={min} />;
    case "text": return aggregate.recent.length ? <ul className="text-list">{aggregate.recent.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p className="muted">No answers yet.</p>;
    case "clicks": return <p className="big-number">{aggregate.total}<small> clicks</small></p>;
    case "form": return (
      <div className="form-results">
        {(fields ?? []).map((field) => (
          <div key={field.id}>
            <h5>{field.label}</h5>
            <AggregateView aggregate={aggregate.fields[field.id]} options={field.kind === "yesno" ? YES_NO : field.options} max={field.max ?? (field.kind === "rating" ? 5 : 100)} min={field.kind === "slider" ? field.min ?? 0 : 1} />
          </div>
        ))}
      </div>
    );
  }
}

function Histogram({ aggregate, max, min = 1 }: { aggregate: Extract<Aggregate, { kind: "numeric" }>; max?: number; min?: number }) {
  if (!aggregate.total) return <p className="muted">No answers yet.</p>;
  const entries = Object.entries(aggregate.histogram).map(([value, count]) => [Number(value), count] as const).sort((a, b) => a[0] - b[0]);
  const bucketed = entries.length > 12 && max !== undefined ? bucket(entries, min, max) : entries.map(([value, count]) => [String(value), count] as const);
  const peak = Math.max(...bucketed.map(([, count]) => count));
  return (
    <div className="histogram">
      <p className="big-number">{aggregate.average.toFixed(1)}{max !== undefined && <small> / {max}</small>}</p>
      <div className="histogram-bars">
        {bucketed.map(([label, count]) => <div key={label} title={`${label}: ${count}`}><i style={{ height: `${(count / peak) * 100}%` }} /><span>{label}</span></div>)}
      </div>
    </div>
  );
}

function bucket(entries: (readonly [number, number])[], min: number, max: number) {
  const size = Math.ceil((max - min + 1) / 10);
  const buckets = new Map<string, number>();
  for (const [value, count] of entries) { const start = min + Math.floor((value - min) / size) * size; const label = `${start}–${Math.min(max, start + size - 1)}`; buckets.set(label, (buckets.get(label) ?? 0) + count); }
  return [...buckets.entries()];
}
