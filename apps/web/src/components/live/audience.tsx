"use client";
import { useEffect, useMemo, useState } from "react";
import { choiceOptions, interactionOf, YES_NO, type Aggregate, type ChoiceOption, type FormField, type InteractionConfig, type PresentationDoc, type ResponseValue, type Reveal } from "@livo/types";
import { leaveRoom } from "@/app/join/actions";
import { Logo } from "@/components/brand";
import { BusyLabel, SubmitButton } from "@/components/loading";
import { ChoiceBars, SlideThumb } from "@/components/slide/render";
import { formatSeconds, useCountdown, useRoom, type RoomConnection } from "@/lib/use-room";

// Deterministic per-participant shuffle so "Shuffle options" is stable across reconnects.
function shuffled<T>(items: T[], seed: string): T[] {
  let hash = 0;
  for (const char of seed) hash = (Math.imul(hash ^ char.charCodeAt(0), 2654435761) >>> 0);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) { hash = (Math.imul(hash, 1103515245) + 12345) >>> 0; const j = hash % (i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

export function Audience({ doc, roomId, code, token, host, name }: { doc: PresentationDoc; roomId: string; code: string; token: string; host: string; name: string }) {
  const room = useRoom({ host, roomId, token });
  const { state, connection } = room;
  const slide = doc.slides.find((item) => item.id === state?.currentSlideId);
  const countdown = useCountdown(state?.timer);

  const header = (
    <header className="audience-top">
      <Logo href={null} size={28} />
      <span className="audience-room">{doc.title}</span>
      <span className={`conn conn-${connection}`} title={connection}>{connection === "open" ? "Connected" : connection === "reconnecting" ? "Reconnecting…" : "Connecting…"}</span>
    </header>
  );

  if (connection === "invalid") return <Shell header={header}><Notice icon="⚠" title="Invalid session link">Ask the presenter for the room code and join again.<form action={leaveRoom.bind(null, code)}><SubmitButton className="button-secondary">Join again</SubmitButton></form></Notice></Shell>;
  if (connection === "full") return <Shell header={header}><Notice icon="👥" title="This session is currently full">Try again in a moment.</Notice></Shell>;
  if (!state) return <Shell header={header}><Notice icon={<span className="spinner" />} title="Connecting…">Joining room {code}</Notice></Shell>;
  if (state.status === "ended") return <Shell header={header}><Notice icon="✓" title="Session ended">Thank you for participating, {name}.</Notice></Shell>;

  const waiting = state.status === "ready" || state.status === "draft" || !slide;
  const interactions = (slide?.elements ?? []).map(interactionOf).filter((item): item is InteractionConfig => item !== null);

  return (
    <Shell header={header}>
      {connection === "reconnecting" && <div className="banner banner-warn">Connection lost. Trying to reconnect…</div>}
      {state.status === "paused" && <div className="banner">The presenter paused the session.</div>}
      {waiting ? (
        <Notice icon="✓" title={`You're in, ${name}!`}>Waiting for the presenter to start…</Notice>
      ) : (
        <>
          <div className="audience-slide">
            <SlideThumb slide={slide} context={{ linksEnabled: true }} />
            <span className="audience-slide-meta">Slide {state.currentSlideIndex + 1} of {doc.slides.length}{countdown !== null && <b className="audience-timer">⏱ {formatSeconds(countdown)}</b>}</span>
          </div>
          {interactions.length ? (
            <div className="audience-interactions">
              {interactions.map((item) => <InteractionCard key={item.id} item={item} room={room} seed={`${room.you?.participantId}:${item.id}`} />)}
            </div>
          ) : (
            <p className="no-interaction">No interaction enabled</p>
          )}
        </>
      )}
    </Shell>
  );
}

const Shell = ({ header, children }: { header: React.ReactNode; children: React.ReactNode }) => <div className="audience">{header}<main className="audience-body">{children}</main></div>;
const Notice = ({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) => <section className="audience-notice"><div className="status-icon">{icon}</div><h1>{title}</h1><div>{children}</div></section>;

// --- One interactive element -------------------------------------------------------------------

function InteractionCard({ item, room, seed }: { item: InteractionConfig; room: RoomConnection; seed: string }) {
  const { state, answers, reveals, results, error, send } = room;
  const interaction = state?.interaction;
  const open = state?.status === "live" && interaction?.status === "open" && interaction.ids.includes(item.id);
  const answer = answers[item.id];
  const canChange = item.kind === "quiz" ? item.config.allowRetry : item.kind !== "button" && item.config.allowChange;
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => { setPending(false); if (answer !== undefined) setEditing(false); }, [answer]);
  useEffect(() => { if (error?.interactionId === item.id) setPending(false); }, [error, item.id]);

  const submit = (value: ResponseValue) => { setPending(true); send({ type: "RESPOND", payload: { interactionId: item.id, value } }); };
  const showForm = open && (answer === undefined || editing);
  const reveal = reveals[item.id];
  const aggregate = results[item.id];

  return (
    <article className={`audience-card kind-${item.kind}`}>
      <h2>{item.kind === "form" ? item.config.title : item.kind === "button" ? item.config.label : item.config.question}</h2>
      {showForm ? (
        <ResponseForm item={item} seed={seed} initial={answer} pending={pending} onSubmit={submit} />
      ) : answer !== undefined ? (
        <div className="answered">
          <p className="answered-title">✓ {item.kind === "button" ? "Counted!" : "Answer sent"}</p>
          <AnswerSummary item={item} value={answer} />
          {open && canChange && <button type="button" className="text-button" onClick={() => setEditing(true)}>Change answer</button>}
        </div>
      ) : (
        <p className="muted">{interaction?.ids.includes(item.id) && interaction.status === "closed" ? "Responses are closed." : "Waiting for the presenter to open responses…"}</p>
      )}
      {error?.interactionId === item.id && <p className="form-error">{error.message}</p>}
      {reveal && <RevealNote item={item} reveal={reveal} />}
      {aggregate && <AudienceResults item={item} aggregate={aggregate} correct={reveal?.correct} />}
    </article>
  );
}

function RevealNote({ item, reveal }: { item: InteractionConfig; reveal: Reveal }) {
  const options = item.kind === "quiz" ? choiceOptions(item.config) : [];
  const correctText = item.kind === "quiz" && item.config.mode === "text" ? reveal.correct.join(" / ") : reveal.correct.map((id) => options.find((option) => option.id === id)?.label ?? id).join(", ");
  return (
    <div className={`reveal ${reveal.yours === true ? "is-correct" : reveal.yours === false ? "is-wrong" : ""}`}>
      {reveal.yours !== undefined && <strong>{reveal.yours ? "🎉 Correct!" : "Not quite."}</strong>}
      <span>Answer: {correctText}</span>
      {reveal.explanation && <p>{reveal.explanation}</p>}
    </div>
  );
}

function AudienceResults({ item, aggregate, correct }: { item: InteractionConfig; aggregate: Aggregate; correct?: string[] }) {
  if ((item.kind === "quiz" || item.kind === "poll") && aggregate.kind === "choice") return <div className="audience-results"><ChoiceBars options={choiceOptions(item.config)} aggregate={aggregate} correct={correct} accent="#8b6cff" /></div>;
  if (aggregate.kind === "numeric") return <p className="audience-results muted">Average: <b>{aggregate.average.toFixed(1)}</b> from {aggregate.total} responses</p>;
  if (aggregate.kind === "clicks") return <p className="audience-results muted"><b>{aggregate.total}</b> clicks</p>;
  if (aggregate.kind === "text") return <div className="audience-results text-wall">{aggregate.recent.slice(0, 8).map((text, index) => <span key={index}>{text}</span>)}</div>;
  return null;
}

function AnswerSummary({ item, value }: { item: InteractionConfig; value: ResponseValue }) {
  const label = (options: ChoiceOption[], id: unknown) => options.find((option) => option.id === id)?.label ?? String(id);
  if ((item.kind === "quiz" || item.kind === "poll") && item.config.mode !== "text") {
    const options = choiceOptions(item.config);
    return <p className="muted">{(Array.isArray(value) ? value : [value]).map((id) => label(options, id)).join(", ")}</p>;
  }
  if (item.kind === "rating") return <p className="muted">{String(value)} / {item.config.max}</p>;
  if (item.kind === "slider") return <p className="muted">{String(value)}{item.config.unit}</p>;
  if (typeof value === "string") return <p className="muted">“{value}”</p>;
  return null;
}

const sliderDefault = (field: FormField) => { const min = field.min ?? 0, max = field.max ?? 100, step = field.step ?? 1; return min + Math.round((max - min) / 2 / step) * step; };

// --- Inputs per interaction kind ------------------------------------------------------------------

function ResponseForm({ item, seed, initial, pending, onSubmit }: { item: InteractionConfig; seed: string; initial?: ResponseValue; pending: boolean; onSubmit: (value: ResponseValue) => void }) {
  const [value, setValue] = useState<ResponseValue | undefined>(initial ?? (item.kind === "slider" ? item.config.defaultValue : item.kind === "form" ? Object.fromEntries(item.config.fields.filter((field) => field.kind === "slider").map((field) => [field.id, sliderDefault(field)])) : undefined));
  const options = useMemo(() => {
    if (item.kind !== "quiz" && item.kind !== "poll") return [];
    const list = choiceOptions(item.config);
    return item.kind === "quiz" && item.config.randomize && item.config.mode !== "yesno" ? shuffled(list, seed) : list;
  }, [item, seed]);

  if (item.kind === "button") return <button type="button" className="button-primary big" disabled={pending} aria-busy={pending || undefined} onClick={() => onSubmit(true)}><BusyLabel busy={pending}>{item.config.label}</BusyLabel></button>;

  const ready = (() => {
    if (value === undefined || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    if (item.kind === "form") return item.config.fields.every((field) => !field.required || ((value as Record<string, unknown>)[field.id] ?? "") !== "");
    return true;
  })();

  return (
    <form className="response-form" onSubmit={(event) => { event.preventDefault(); if (ready && value !== undefined) onSubmit(typeof value === "string" ? value.trim() : value); }}>
      {(item.kind === "quiz" || item.kind === "poll") && item.config.mode !== "text" && (
        <ChoiceInput options={options} multiple={item.config.mode === "multiple"} value={value} onChange={setValue} />
      )}
      {((item.kind === "quiz" && item.config.mode === "text") || item.kind === "open_text") && (
        item.kind === "open_text" && item.config.multiline
          ? <textarea value={String(value ?? "")} maxLength={item.config.maxLength} placeholder={item.config.placeholder} rows={4} onChange={(event) => setValue(event.target.value)} />
          : <input value={String(value ?? "")} maxLength={item.kind === "open_text" ? item.config.maxLength : 280} placeholder={item.kind === "open_text" ? item.config.placeholder : "Type your answer"} onChange={(event) => setValue(event.target.value)} />
      )}
      {item.kind === "rating" && <RatingInput max={item.config.max} icon={item.config.icon} half={item.config.allowHalf} value={value as number | undefined} onChange={setValue} />}
      {item.kind === "slider" && <SliderInput {...item.config} value={value as number} onChange={setValue} />}
      {item.kind === "form" && item.config.fields.map((field) => (
        <FieldInput key={field.id} field={field} value={(value as Record<string, string | string[] | number>)[field.id]} onChange={(fieldValue) => setValue({ ...(value as Record<string, string | string[] | number>), [field.id]: fieldValue as string | number })} />
      ))}
      <button className="button-primary big" disabled={!ready || pending} aria-busy={pending || undefined}><BusyLabel busy={pending} busyLabel="Sending…">{item.kind === "form" ? item.config.submitLabel || "Submit" : "Submit"}</BusyLabel></button>
    </form>
  );
}

function ChoiceInput({ options, multiple, value, onChange }: { options: ChoiceOption[]; multiple: boolean; value: ResponseValue | undefined; onChange: (value: ResponseValue) => void }) {
  const selected = Array.isArray(value) ? value : value !== undefined ? [value] : [];
  return (
    <div className="choice-input" role={multiple ? "group" : "radiogroup"}>
      {options.map((option, index) => {
        const on = selected.includes(option.id);
        return (
          <button key={option.id} type="button" role={multiple ? "checkbox" : "radio"} aria-checked={on} className={on ? "is-on" : ""}
            onClick={() => onChange(multiple ? (on ? (selected as string[]).filter((id) => id !== option.id) : [...(selected as string[]), option.id]) : option.id)}>
            <b>{"ABCDEFGHIJ"[index]}</b><span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function RatingInput({ max, icon, half, value, onChange }: { max: number; icon: string; half: boolean; value?: number; onChange: (value: number) => void }) {
  const glyph = icon === "heart" ? "♥" : icon === "thumb" ? "👍" : "★";
  return (
    <div className="rating-input" role="radiogroup">
      {Array.from({ length: max }, (_, index) => index + 1).map((score) => (
        <button key={score} type="button" role="radio" aria-checked={value === score} aria-label={`${score} of ${max}`} className={value !== undefined && score <= Math.ceil(value) ? "is-on" : ""}
          onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onChange(half && event.clientX - rect.left < rect.width / 2 ? score - 0.5 : score); }}>
          {glyph}
        </button>
      ))}
      {value !== undefined && <span className="rating-value">{value} / {max}</span>}
    </div>
  );
}

function SliderInput({ min, max, step, unit, minLabel, maxLabel, value, onChange }: { min: number; max: number; step: number; unit: string; minLabel: string; maxLabel: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="slider-input">
      <output>{value}{unit}</output>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <div className="slider-labels"><span>{minLabel || `${min}${unit}`}</span><span>{maxLabel || `${max}${unit}`}</span></div>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: FormField; value: string | string[] | number | undefined; onChange: (value: string | number) => void }) {
  const label = <span className="field-label">{field.label}{field.required && <i> *</i>}</span>;
  switch (field.kind) {
    case "short_text": return <label className="form-field">{label}<input value={String(value ?? "")} maxLength={200} onChange={(event) => onChange(event.target.value)} /></label>;
    case "long_text": return <label className="form-field">{label}<textarea rows={3} value={String(value ?? "")} maxLength={2000} onChange={(event) => onChange(event.target.value)} /></label>;
    case "rating": return <div className="form-field">{label}<RatingInput max={field.max ?? 5} icon="star" half={false} value={value as number | undefined} onChange={onChange} /></div>;
    case "slider": return <div className="form-field">{label}<SliderInput min={field.min ?? 0} max={field.max ?? 100} step={field.step ?? 1} unit="" minLabel="" maxLabel="" value={(value as number | undefined) ?? sliderDefault(field)} onChange={onChange} /></div>;
    case "choice": case "yesno": return <div className="form-field">{label}<ChoiceInput options={field.kind === "yesno" ? YES_NO : field.options ?? []} multiple={false} value={value as string | undefined} onChange={(next) => onChange(next as string)} /></div>;
  }
}
