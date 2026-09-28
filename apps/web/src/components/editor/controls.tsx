"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { Fill } from "@livo/types";

/** Inputs group their keystrokes/drags into one undo step between focus and blur. */
export const TransactionContext = createContext<{ begin: () => void; end: () => void }>({ begin() {}, end() {} });
const useTransaction = () => { const { begin, end } = useContext(TransactionContext); return { onFocus: begin, onBlur: end }; };

export const Section = ({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) => (
  <section className="panel-section"><header><h3>{title}</h3>{actions}</header>{children}</section>
);

export const Row = ({ children }: { children: ReactNode }) => <div className="field-row">{children}</div>;

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field${wide ? " field-wide" : ""}`}><span>{label}</span>{children}</label>;
}

export function TextInput({ label, value, onChange, multiline, placeholder, maxLength }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; placeholder?: string; maxLength?: number }) {
  const transaction = useTransaction();
  return (
    <Field label={label} wide>
      {multiline
        ? <textarea value={value} placeholder={placeholder} maxLength={maxLength} rows={3} onChange={(event) => onChange(event.target.value)} {...transaction} />
        : <input value={value} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} {...transaction} />}
    </Field>
  );
}

export function NumberInput({ label, value, onChange, min, max, step = 1, suffix }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  const transaction = useTransaction();
  return (
    <Field label={label}>
      <span className="number-input">
        <input type="number" value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} min={min} max={max} step={step} {...transaction}
          onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next))); }} />
        {suffix && <i>{suffix}</i>}
      </span>
    </Field>
  );
}

export function RangeInput({ label, value, onChange, min, max, step = 1, suffix = "" }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  const transaction = useTransaction();
  return (
    <Field label={`${label} · ${Math.round(value * 100) / 100}${suffix}`} wide>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} onPointerDown={transaction.onFocus} onPointerUp={transaction.onBlur} {...transaction} />
    </Field>
  );
}

export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const transaction = useTransaction();
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <Field label={label}>
      <span className="color-input">
        <input type="color" value={hex} onChange={(event) => onChange(event.target.value)} {...transaction} />
        <input value={value} onChange={(event) => onChange(event.target.value)} {...transaction} />
      </span>
    </Field>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}
      </select>
    </Field>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, ReactNode, string])[]; onChange: (value: T) => void; label?: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([option, icon, title]) => <button key={option} type="button" title={title} aria-pressed={value === option} className={value === option ? "is-active" : ""} onClick={() => onChange(option)}>{icon}</button>)}
    </div>
  );
}

export function FillInput({ label, value, onChange, allowNone = true }: { label: string; value: Fill | undefined; onChange: (fill: Fill) => void; allowNone?: boolean }) {
  const fill: Fill = value ?? { type: "none" };
  const types = [...(allowNone ? [["none", "None"] as const] : []), ["solid", "Solid"] as const, ["linear", "Gradient"] as const];
  return (
    <div className="fill-input">
      <Select label={label} value={fill.type} options={types}
        onChange={(type) => onChange(type === "none" ? { type } : type === "solid" ? { type, color: fill.type === "linear" ? fill.from : fill.type === "solid" ? fill.color : "#4f7bff" } : { type, angle: 135, from: fill.type === "solid" ? fill.color : "#8b6cff", to: "#4f7bff" })} />
      {fill.type === "solid" && <ColorInput label="Color" value={fill.color} onChange={(color) => onChange({ ...fill, color })} />}
      {fill.type === "linear" && <>
        <Row><ColorInput label="From" value={fill.from} onChange={(from) => onChange({ ...fill, from })} /><ColorInput label="To" value={fill.to} onChange={(to) => onChange({ ...fill, to })} /></Row>
        <RangeInput label="Angle" value={fill.angle} min={0} max={360} suffix="°" onChange={(angle) => onChange({ ...fill, angle })} />
      </>}
    </div>
  );
}
