import { choiceOptions, type FormField, type InteractionConfig } from "./model";

export type ResponseValue = string | string[] | number | boolean | Record<string, string | string[] | number>;

export type Aggregate =
  | { kind: "choice"; total: number; counts: Record<string, number>; correct?: number }
  | { kind: "numeric"; total: number; average: number; min: number; max: number; histogram: Record<string, number> }
  | { kind: "text"; total: number; recent: string[]; correct?: number }
  | { kind: "clicks"; total: number }
  | { kind: "form"; total: number; fields: Record<string, Aggregate> };

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const onStep = (value: number, min: number, step: number) => step <= 0 || Math.abs((value - min) / step - Math.round((value - min) / step)) < 1e-6;
const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

function validChoice(value: unknown, ids: string[], multiple: boolean): string | string[] | null {
  if (multiple) {
    if (!Array.isArray(value) || !value.length || value.length > ids.length) return null;
    const unique = [...new Set(value)];
    return unique.every((id) => typeof id === "string" && ids.includes(id)) ? (unique as string[]) : null;
  }
  return typeof value === "string" && ids.includes(value) ? value : null;
}

function validText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length && text.length <= maxLength ? text : null;
}

function validField(field: FormField, value: unknown): string | string[] | number | null {
  switch (field.kind) {
    case "short_text": return validText(value, 200);
    case "long_text": return validText(value, 2000);
    case "rating": return isNumber(value) && value >= 1 && value <= (field.max ?? 5) && Number.isInteger(value) ? value : null;
    case "slider": {
      const min = field.min ?? 0, max = field.max ?? 100;
      return isNumber(value) && value >= min && value <= max && onStep(value, min, field.step ?? 1) ? value : null;
    }
    case "choice": return validChoice(value, (field.options ?? []).map((option) => option.id), false);
    case "yesno": return validChoice(value, ["yes", "no"], false);
  }
}

/** Returns the cleaned response, or null if it doesn't fit the interaction. Runs on the realtime server. */
export function validateResponse(item: InteractionConfig, value: unknown): ResponseValue | null {
  switch (item.kind) {
    case "quiz":
      if (item.config.mode === "text") return validText(value, 280);
      return validChoice(value, choiceOptions(item.config).map((option) => option.id), item.config.mode === "multiple");
    case "poll":
      return validChoice(value, choiceOptions(item.config).map((option) => option.id), item.config.mode === "multiple");
    case "rating": {
      const step = item.config.allowHalf ? 0.5 : 1;
      return isNumber(value) && value >= step && value <= item.config.max && onStep(value, 0, step) ? value : null;
    }
    case "slider": {
      const { min, max, step } = item.config;
      return isNumber(value) && value >= min && value <= max && onStep(value, min, step) ? value : null;
    }
    case "open_text":
      return validText(value, Math.min(item.config.maxLength || 500, 2000));
    case "button":
      return value === true ? true : null;
    case "form": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const input = value as Record<string, unknown>;
      const cleaned: Record<string, string | string[] | number> = {};
      for (const field of item.config.fields) {
        const raw = input[field.id];
        if (raw === undefined || raw === null || raw === "") { if (field.required) return null; continue; }
        const valid = validField(field, raw);
        if (valid === null) return null;
        cleaned[field.id] = valid;
      }
      return Object.keys(cleaned).length ? cleaned : null;
    }
  }
}

/** Whether a quiz answer is correct; undefined for anything that isn't scored. */
export function isCorrect(item: InteractionConfig, value: ResponseValue): boolean | undefined {
  if (item.kind !== "quiz" || !item.config.correct.length) return undefined;
  const { mode, correct } = item.config;
  if (mode === "text") return typeof value === "string" && correct.some((answer) => normalise(answer) === normalise(value));
  if (mode === "multiple") return Array.isArray(value) && value.length === correct.length && correct.every((id) => value.includes(id));
  return typeof value === "string" && correct.includes(value);
}

export const allowsChange = (item: InteractionConfig): boolean =>
  item.kind === "quiz" ? item.config.allowRetry : item.kind === "button" ? false : item.config.allowChange;

function choiceAggregate(values: unknown[], ids: string[]): Aggregate {
  const counts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const value of values) for (const id of Array.isArray(value) ? value : [value]) if (typeof id === "string" && id in counts) counts[id] += 1;
  return { kind: "choice", total: values.length, counts };
}

function numericAggregate(values: unknown[]): Aggregate {
  const numbers = values.filter(isNumber);
  const histogram: Record<string, number> = {};
  for (const value of numbers) histogram[String(value)] = (histogram[String(value)] ?? 0) + 1;
  const sum = numbers.reduce((total, value) => total + value, 0);
  return { kind: "numeric", total: numbers.length, average: numbers.length ? sum / numbers.length : 0, min: numbers.length ? Math.min(...numbers) : 0, max: numbers.length ? Math.max(...numbers) : 0, histogram };
}

const textAggregate = (values: unknown[]): Aggregate => {
  const texts = values.filter((value): value is string => typeof value === "string");
  return { kind: "text", total: texts.length, recent: texts.slice(-40).reverse() };
};

function fieldAggregate(field: FormField, values: unknown[]): Aggregate {
  switch (field.kind) {
    case "short_text": case "long_text": return textAggregate(values);
    case "rating": case "slider": return numericAggregate(values);
    case "choice": return choiceAggregate(values, (field.options ?? []).map((option) => option.id));
    case "yesno": return choiceAggregate(values, ["yes", "no"]);
  }
}

/** Aggregates responses in arrival order. Used live by the room and after the session by analytics. */
export function aggregate(item: InteractionConfig, values: ResponseValue[]): Aggregate {
  switch (item.kind) {
    case "quiz": {
      const correct = values.filter((value) => isCorrect(item, value)).length;
      const base = item.config.mode === "text" ? textAggregate(values) : choiceAggregate(values, choiceOptions(item.config).map((option) => option.id));
      return { ...base, correct } as Aggregate;
    }
    case "poll": return choiceAggregate(values, choiceOptions(item.config).map((option) => option.id));
    case "rating": case "slider": return numericAggregate(values);
    case "open_text": return textAggregate(values);
    case "button": return { kind: "clicks", total: values.length };
    case "form": {
      const records = values.filter((value): value is Record<string, string | string[] | number> => !!value && typeof value === "object" && !Array.isArray(value));
      const fields = Object.fromEntries(item.config.fields.map((field) => [field.id, fieldAggregate(field, records.map((record) => record[field.id]).filter((value) => value !== undefined))]));
      return { kind: "form", total: records.length, fields };
    }
  }
}

/** Human-readable answer (controller answer lists, CSV export). */
export function describeAnswer(item: InteractionConfig, value: ResponseValue): string {
  const label = (options: { id: string; label: string }[], id: unknown) => options.find((option) => option.id === id)?.label ?? String(id);
  if ((item.kind === "quiz" || item.kind === "poll") && item.config.mode !== "text") return (Array.isArray(value) ? value : [value]).map((id) => label(choiceOptions(item.config), id)).join("; ");
  if (item.kind === "form" && value && typeof value === "object" && !Array.isArray(value)) {
    return item.config.fields.filter((field) => field.id in value).map((field) => {
      const answer = (value as Record<string, unknown>)[field.id];
      return `${field.label}: ${field.kind === "choice" ? label(field.options ?? [], answer) : field.kind === "yesno" ? (answer === "yes" ? "Yes" : "No") : String(answer)}`;
    }).join(" | ");
  }
  return value === true ? "clicked" : String(value);
}
