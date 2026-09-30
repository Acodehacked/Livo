"use client";
import { useState } from "react";
import type { ChoiceOption, ElementOf, ElementStyle, FormField, FormFieldKind, ResultsVisibility, ShapeKind, Slide, SlideElement } from "@livo/types";
import { BusyLabel } from "@/components/loading";
import { ELEMENT_LABELS, FONTS, newOption } from "@/lib/elements";
import { IMAGE_TYPES, uploadImage } from "@/lib/upload";
import { ColorInput, Field, FillInput, NumberInput, RangeInput, Row, Section, Segmented, Select, TextInput, Toggle } from "./controls";

export const SHAPES: readonly (readonly [ShapeKind, string])[] = [["rect", "Rectangle"], ["ellipse", "Ellipse"], ["triangle", "Triangle"], ["diamond", "Diamond"], ["pentagon", "Pentagon"], ["hexagon", "Hexagon"], ["star", "Star"], ["arrow", "Arrow"], ["chevron", "Chevron"], ["bubble", "Speech bubble"], ["heart", "Heart"], ["line", "Line"]];
export const ICONS = ["🚀", "💡", "✅", "❌", "⭐", "❤️", "👍", "👏", "🔥", "🎯", "📈", "📊", "🧠", "🤖", "☁️", "🔒", "🌐", "💻", "📱", "🎓", "🏆", "⚡", "🔗", "📌", "🗓️", "⏱️", "💬", "❓", "🙌", "🎉"];
const RESULTS: readonly (readonly [ResultsVisibility, string])[] = [["live", "Live on screen"], ["on_reveal", "When I show them"], ["admin_only", "Only me"]];

export interface PropertyActions {
  presentationId: string;
  update: (ids: string[], fn: (element: SlideElement) => SlideElement) => void;
  updateSlide: (fn: (slide: Slide) => Slide) => void;
  notify: (message: string) => void;
}

// --- Slide ---------------------------------------------------------------------------------

export function SlideProperties({ slide, actions }: { slide: Slide; actions: PropertyActions }) {
  const image = slide.background.image;
  return (
    <>
      <Section title="Slide">
        <TextInput label="Title" value={slide.title} maxLength={200} onChange={(title) => actions.updateSlide((current) => ({ ...current, title }))} />
      </Section>
      <Section title="Background">
        <FillInput label="Fill" value={slide.background.fill} allowNone={false} onChange={(fill) => actions.updateSlide((current) => ({ ...current, background: { ...current.background, fill } }))} />
        <ImageSource label="Image" value={image?.src ?? ""} presentationId={actions.presentationId} notify={actions.notify}
          onChange={(src) => actions.updateSlide((current) => ({ ...current, background: { ...current.background, image: src ? { src, fit: current.background.image?.fit ?? "cover", opacity: current.background.image?.opacity ?? 1 } : null } }))} />
        {image?.src && <>
          <Select label="Image fit" value={image.fit} options={[["cover", "Cover"], ["contain", "Contain"]]} onChange={(fit) => actions.updateSlide((current) => ({ ...current, background: { ...current.background, image: { ...current.background.image!, fit } } }))} />
          <RangeInput label="Image opacity" value={Math.round(image.opacity * 100)} min={0} max={100} suffix="%" onChange={(value) => actions.updateSlide((current) => ({ ...current, background: { ...current.background, image: { ...current.background.image!, opacity: value / 100 } } }))} />
        </>}
      </Section>
      <Section title="Speaker notes">
        <TextInput label="Notes (shown on the controller)" multiline value={slide.notes} onChange={(notes) => actions.updateSlide((current) => ({ ...current, notes }))} />
      </Section>
    </>
  );
}

// --- Elements --------------------------------------------------------------------------------

export function ElementProperties({ elements, actions }: { elements: SlideElement[]; actions: PropertyActions }) {
  const ids = elements.map((element) => element.id);
  const first = elements[0];
  const setStyle = (patch: Partial<ElementStyle>) => actions.update(ids, (element) => ({ ...element, style: { ...element.style, ...patch } }));
  const style = first.style ?? {};
  const single = elements.length === 1;
  const hasSurface = elements.every((element) => element.type !== "icon" && element.type !== "link");
  const isCard = elements.every((element) => ["quiz", "poll", "rating", "slider", "open_text", "form"].includes(element.type));

  return (
    <>
      {single && <TypeProperties element={first} actions={actions} />}
      {single && (
        <Section title="Position & size">
          <Row>
            <NumberInput label="X" value={first.x} onChange={(x) => actions.update(ids, (element) => ({ ...element, x }))} />
            <NumberInput label="Y" value={first.y} onChange={(y) => actions.update(ids, (element) => ({ ...element, y }))} />
          </Row>
          <Row>
            <NumberInput label="W" value={first.width} min={2} onChange={(width) => actions.update(ids, (element) => ({ ...element, width }))} />
            <NumberInput label="H" value={first.height} min={2} onChange={(height) => actions.update(ids, (element) => ({ ...element, height }))} />
            <NumberInput label="Rotate" value={first.rotation} min={0} max={359} suffix="°" onChange={(rotation) => actions.update(ids, (element) => ({ ...element, rotation }))} />
          </Row>
        </Section>
      )}
      <Section title="Appearance">
        {hasSurface && <FillInput label={isCard ? "Card fill" : "Fill"} value={style.fill} onChange={(fill) => setStyle({ fill })} />}
        {isCard && <Row><ColorInput label="Text" value={style.textColor ?? "#171a2e"} onChange={(textColor) => setStyle({ textColor })} /><ColorInput label="Accent" value={style.accent ?? "#4f7bff"} onChange={(accent) => setStyle({ accent })} /></Row>}
        {hasSurface && <>
          <Row>
            <NumberInput label="Border" value={style.borderWidth ?? 0} min={0} max={40} suffix="px" onChange={(borderWidth) => setStyle({ borderWidth })} />
            <NumberInput label="Radius" value={style.radius ?? 0} min={0} max={400} suffix="px" onChange={(radius) => setStyle({ radius })} />
          </Row>
          {!!style.borderWidth && <Row>
            <ColorInput label="Border color" value={style.borderColor ?? "#000000"} onChange={(borderColor) => setStyle({ borderColor })} />
            <Select label="Style" value={style.borderStyle ?? "solid"} options={[["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]} onChange={(borderStyle) => setStyle({ borderStyle })} />
          </Row>}
          <Toggle label="Shadow" checked={!!style.shadow} onChange={(on) => setStyle({ shadow: on ? { x: 0, y: 12, blur: 32, color: "rgba(15,20,50,0.25)" } : null })} />
          {style.shadow && <>
            <Row>
              <NumberInput label="X" value={style.shadow.x} onChange={(x) => setStyle({ shadow: { ...style.shadow!, x } })} />
              <NumberInput label="Y" value={style.shadow.y} onChange={(y) => setStyle({ shadow: { ...style.shadow!, y } })} />
              <NumberInput label="Blur" value={style.shadow.blur} min={0} onChange={(blur) => setStyle({ shadow: { ...style.shadow!, blur } })} />
            </Row>
            <ColorInput label="Shadow color" value={style.shadow.color} onChange={(color) => setStyle({ shadow: { ...style.shadow!, color } })} />
          </>}
        </>}
        <RangeInput label="Opacity" value={Math.round((style.opacity ?? 1) * 100)} min={0} max={100} suffix="%" onChange={(value) => setStyle({ opacity: value / 100 })} />
      </Section>
    </>
  );
}

function TypeProperties({ element, actions }: { element: SlideElement; actions: PropertyActions }) {
  const setProps = <T extends SlideElement>(patch: Partial<T["props"]>) => actions.update([element.id], (current) => ({ ...current, props: { ...current.props, ...patch } }) as SlideElement);
  const title = ELEMENT_LABELS[element.type];
  switch (element.type) {
    case "text": {
      const p = element.props;
      const set = setProps<ElementOf<"text">>;
      return (
        <Section title="Text">
          <RichTextToolbar />
          <Row>
            <Select label="Font" value={p.fontFamily} options={FONTS.map((font) => [font, font] as const)} onChange={(fontFamily) => set({ fontFamily })} />
            <NumberInput label="Size" value={p.fontSize} min={8} max={300} onChange={(fontSize) => set({ fontSize })} />
          </Row>
          <Row>
            <ColorInput label="Color" value={p.color} onChange={(color) => set({ color })} />
            <NumberInput label="Line height" value={p.lineHeight} min={0.8} max={3} step={0.05} onChange={(lineHeight) => set({ lineHeight })} />
          </Row>
          <Row>
            <Field label="Align"><Segmented value={p.align} onChange={(align) => set({ align })} options={[["left", "⟸", "Left"], ["center", "⇔", "Center"], ["right", "⟹", "Right"]]} /></Field>
            <Field label="Vertical"><Segmented value={p.valign} onChange={(valign) => set({ valign })} options={[["top", "⤒", "Top"], ["middle", "↕", "Middle"], ["bottom", "⤓", "Bottom"]]} /></Field>
          </Row>
        </Section>
      );
    }
    case "image": {
      const p = element.props;
      const set = setProps<ElementOf<"image">>;
      return (
        <Section title="Image">
          <ImageSource label="Source" value={p.src} presentationId={actions.presentationId} notify={actions.notify} onChange={(src) => set({ src })} />
          <TextInput label="Alt text" value={p.alt} onChange={(alt) => set({ alt })} />
          <Row>
            <Select label="Fit" value={p.fit} options={[["cover", "Crop to fill"], ["contain", "Fit"], ["fill", "Stretch"]]} onChange={(fit) => set({ fit })} />
            <Field label="Flip"><Segmented value={`${p.flipX ? "x" : ""}${p.flipY ? "y" : ""}` as string} onChange={(value) => set(value === "x" ? { flipX: !p.flipX } : { flipY: !p.flipY })} options={[["x", "⇋", "Flip horizontal"], ["y", "⇵", "Flip vertical"]]} /></Field>
          </Row>
          <RangeInput label="Brightness" value={p.brightness} min={0} max={200} suffix="%" onChange={(brightness) => set({ brightness })} />
          <RangeInput label="Contrast" value={p.contrast} min={0} max={200} suffix="%" onChange={(contrast) => set({ contrast })} />
          <RangeInput label="Grayscale" value={p.grayscale} min={0} max={100} suffix="%" onChange={(grayscale) => set({ grayscale })} />
          <RangeInput label="Blur" value={p.blur} min={0} max={20} suffix="px" onChange={(blur) => set({ blur })} />
        </Section>
      );
    }
    case "shape": {
      const p = element.props;
      const set = setProps<ElementOf<"shape">>;
      return (
        <Section title="Shape">
          <Select label="Shape" value={p.shape} options={SHAPES} onChange={(shape) => set({ shape })} />
          {p.shape !== "line" && <>
            <TextInput label="Label" value={p.text} onChange={(text) => set({ text })} />
            <Row><ColorInput label="Label color" value={p.textColor} onChange={(textColor) => set({ textColor })} /><NumberInput label="Size" value={p.fontSize} min={8} max={200} onChange={(fontSize) => set({ fontSize })} /></Row>
          </>}
        </Section>
      );
    }
    case "icon":
      return (
        <Section title="Icon">
          <div className="icon-grid">{ICONS.map((glyph) => <button key={glyph} type="button" className={glyph === element.props.glyph ? "is-active" : ""} onClick={() => setProps<ElementOf<"icon">>({ glyph })}>{glyph}</button>)}</div>
          <TextInput label="Custom (any emoji or symbol)" value={element.props.glyph} maxLength={8} onChange={(glyph) => setProps<ElementOf<"icon">>({ glyph })} />
        </Section>
      );
    case "link": {
      const p = element.props;
      const set = setProps<ElementOf<"link">>;
      return (
        <Section title="Link">
          <TextInput label="Label" value={p.label} onChange={(label) => set({ label })} />
          <TextInput label="URL" value={p.url} placeholder="https://" onChange={(url) => set({ url })} />
          <Row><ColorInput label="Color" value={p.color} onChange={(color) => set({ color })} /><NumberInput label="Size" value={p.fontSize} min={8} max={200} onChange={(fontSize) => set({ fontSize })} /></Row>
        </Section>
      );
    }
    case "button": {
      const p = element.props;
      const set = setProps<ElementOf<"button">>;
      return (
        <Section title="Button">
          <TextInput label="Label" value={p.label} onChange={(label) => set({ label })} />
          <Select label="Action" value={p.action} options={[["respond", "Count audience clicks"], ["link", "Open a link"]]} onChange={(action) => set({ action })} />
          {p.action === "link" ? <TextInput label="URL" value={p.url} placeholder="https://" onChange={(url) => set({ url })} /> : <Select label="Show click count" value={p.results} options={RESULTS} onChange={(results) => set({ results })} />}
          <Row><ColorInput label="Text color" value={p.textColor} onChange={(textColor) => set({ textColor })} /><NumberInput label="Size" value={p.fontSize} min={8} max={200} onChange={(fontSize) => set({ fontSize })} /></Row>
        </Section>
      );
    }
    case "quiz": {
      const p = element.props;
      const set = setProps<ElementOf<"quiz">>;
      return (
        <>
          <Section title={title}>
            <TextInput label="Question" multiline value={p.question} onChange={(question) => set({ question })} />
            <Select label="Answer type" value={p.mode} options={[["single", "Single choice"], ["multiple", "Multiple choice"], ["yesno", "Yes / No"], ["text", "Typed answer"]]} onChange={(mode) => set({ mode, correct: [] })} />
            {p.mode === "text"
              ? <TextInput label="Accepted answers (one per line)" multiline value={p.correct.join("\n")} onChange={(value) => set({ correct: value.split("\n").map((line) => line.trim()).filter(Boolean) })} />
              : <OptionsEditor options={p.mode === "yesno" ? [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] : p.options} fixed={p.mode === "yesno"} correct={p.correct} multiple={p.mode === "multiple"}
                  onOptions={(options) => set({ options, correct: p.correct.filter((id) => options.some((option) => option.id === id)) })} onCorrect={(correct) => set({ correct })} />}
          </Section>
          <Section title="Quiz settings">
            <Row>
              <NumberInput label="Points" value={p.points} min={0} max={10000} onChange={(points) => set({ points })} />
              <NumberInput label="Time limit" value={p.timeLimit} min={0} max={3600} suffix="s" onChange={(timeLimit) => set({ timeLimit })} />
            </Row>
            <Select label="Results" value={p.results} options={RESULTS} onChange={(results) => set({ results })} />
            <TextInput label="Explanation (shown after the quiz closes)" multiline value={p.explanation} onChange={(explanation) => set({ explanation })} />
            <Toggle label="Show correct answer when closed" checked={p.showCorrect} onChange={(showCorrect) => set({ showCorrect })} />
            <Toggle label="Shuffle options for each person" checked={p.randomize} onChange={(randomize) => set({ randomize })} />
            <Toggle label="Allow changing the answer" checked={p.allowRetry} onChange={(allowRetry) => set({ allowRetry })} />
            <Toggle label="Required" checked={p.required} onChange={(required) => set({ required })} />
            {p.mode !== "text" && !p.correct.length && <p className="hint">Tick the correct option(s) to score this quiz.</p>}
          </Section>
        </>
      );
    }
    case "poll": {
      const p = element.props;
      const set = setProps<ElementOf<"poll">>;
      return (
        <Section title={title}>
          <TextInput label="Question" multiline value={p.question} onChange={(question) => set({ question })} />
          <Select label="Answer type" value={p.mode} options={[["single", "Single choice"], ["multiple", "Multiple choice"], ["yesno", "Yes / No"]]} onChange={(mode) => set({ mode })} />
          {p.mode !== "yesno" && <OptionsEditor options={p.options} onOptions={(options) => set({ options })} />}
          <SurveySettings value={p} onChange={set} />
        </Section>
      );
    }
    case "rating": {
      const p = element.props;
      const set = setProps<ElementOf<"rating">>;
      return (
        <Section title={title}>
          <TextInput label="Question" multiline value={p.question} onChange={(question) => set({ question })} />
          <Row>
            <NumberInput label="Maximum" value={p.max} min={3} max={10} onChange={(max) => set({ max })} />
            <Select label="Icon" value={p.icon} options={[["star", "★ Star"], ["heart", "♥ Heart"], ["thumb", "👍 Thumb"]]} onChange={(icon) => set({ icon })} />
          </Row>
          <Toggle label="Allow half ratings" checked={p.allowHalf} onChange={(allowHalf) => set({ allowHalf })} />
          <SurveySettings value={p} onChange={set} />
        </Section>
      );
    }
    case "slider": {
      const p = element.props;
      const set = setProps<ElementOf<"slider">>;
      return (
        <Section title={title}>
          <TextInput label="Question" multiline value={p.question} onChange={(question) => set({ question })} />
          <Row>
            <NumberInput label="Min" value={p.min} onChange={(min) => set({ min })} />
            <NumberInput label="Max" value={p.max} onChange={(max) => set({ max })} />
            <NumberInput label="Step" value={p.step} min={0.01} onChange={(step) => set({ step })} />
          </Row>
          <Row>
            <NumberInput label="Default" value={p.defaultValue} min={p.min} max={p.max} onChange={(defaultValue) => set({ defaultValue })} />
            <TextInput label="Unit" value={p.unit} maxLength={8} onChange={(unit) => set({ unit })} />
          </Row>
          <Row>
            <TextInput label="Min label" value={p.minLabel} onChange={(minLabel) => set({ minLabel })} />
            <TextInput label="Max label" value={p.maxLabel} onChange={(maxLabel) => set({ maxLabel })} />
          </Row>
          <SurveySettings value={p} onChange={set} />
        </Section>
      );
    }
    case "open_text": {
      const p = element.props;
      const set = setProps<ElementOf<"open_text">>;
      return (
        <Section title={title}>
          <TextInput label="Question" multiline value={p.question} onChange={(question) => set({ question })} />
          <TextInput label="Placeholder" value={p.placeholder} onChange={(placeholder) => set({ placeholder })} />
          <Row>
            <NumberInput label="Max length" value={p.maxLength} min={10} max={2000} onChange={(maxLength) => set({ maxLength })} />
            <Field label="Box"><Segmented value={p.multiline ? "long" : "short"} onChange={(value) => set({ multiline: value === "long" })} options={[["short", "Short", "Single line"], ["long", "Long", "Paragraph"]]} /></Field>
          </Row>
          <SurveySettings value={p} onChange={set} />
        </Section>
      );
    }
    case "form": {
      const p = element.props;
      const set = setProps<ElementOf<"form">>;
      return (
        <>
          <Section title="Form">
            <TextInput label="Title" value={p.title} onChange={(value) => set({ title: value })} />
            <TextInput label="Submit button" value={p.submitLabel} onChange={(submitLabel) => set({ submitLabel })} />
            <SurveySettings value={{ ...p, required: false }} onChange={({ results, allowChange }) => set({ ...(results && { results }), ...(allowChange !== undefined && { allowChange }) })} hideRequired />
          </Section>
          <FormFieldsEditor fields={p.fields} onChange={(fields) => set({ fields })} />
        </>
      );
    }
  }
}

function SurveySettings<T extends { required: boolean; results: ResultsVisibility; allowChange: boolean }>({ value, onChange, hideRequired }: { value: T; onChange: (patch: Partial<T>) => void; hideRequired?: boolean }) {
  return <>
    <Select label="Results visible" value={value.results} options={RESULTS} onChange={(results) => onChange({ results } as Partial<T>)} />
    <Toggle label="Allow changing the answer" checked={value.allowChange} onChange={(allowChange) => onChange({ allowChange } as Partial<T>)} />
    {!hideRequired && <Toggle label="Required" checked={value.required} onChange={(required) => onChange({ required } as Partial<T>)} />}
  </>;
}

function OptionsEditor({ options, onOptions, correct, onCorrect, multiple, fixed }: { options: ChoiceOption[]; onOptions: (options: ChoiceOption[]) => void; correct?: string[]; onCorrect?: (ids: string[]) => void; multiple?: boolean; fixed?: boolean }) {
  const toggleCorrect = (id: string) => onCorrect?.(multiple ? (correct!.includes(id) ? correct!.filter((item) => item !== id) : [...correct!, id]) : [id]);
  const move = (index: number, step: number) => { const next = [...options]; const [item] = next.splice(index, 1); next.splice(index + step, 0, item); onOptions(next); };
  return (
    <div className="options-editor">
      {options.map((option, index) => (
        <div key={option.id} className="option-row">
          {onCorrect && <button type="button" className={`correct-toggle${correct?.includes(option.id) ? " is-on" : ""}`} title="Mark as correct" onClick={() => toggleCorrect(option.id)}>✓</button>}
          <input value={option.label} disabled={fixed} onChange={(event) => onOptions(options.map((item) => (item.id === option.id ? { ...item, label: event.target.value } : item)))} />
          {!fixed && <>
            <button type="button" className="icon-button" disabled={index === 0} onClick={() => move(index, -1)} title="Move up">↑</button>
            <button type="button" className="icon-button" disabled={options.length <= 2} onClick={() => onOptions(options.filter((item) => item.id !== option.id))} title="Remove">✕</button>
          </>}
        </div>
      ))}
      {!fixed && options.length < 10 && <button type="button" className="add-row" onClick={() => onOptions([...options, newOption(`Option ${options.length + 1}`)])}>+ Add option</button>}
    </div>
  );
}

const FIELD_KINDS: readonly (readonly [FormFieldKind, string])[] = [["short_text", "Short text"], ["long_text", "Paragraph"], ["rating", "Rating"], ["slider", "Slider"], ["choice", "Multiple choice"], ["yesno", "Yes / No"]];

function FormFieldsEditor({ fields, onChange }: { fields: FormField[]; onChange: (fields: FormField[]) => void }) {
  const update = (id: string, patch: Partial<FormField>) => onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  return (
    <Section title="Fields" actions={fields.length < 12 && <button type="button" className="text-button" onClick={() => onChange([...fields, { id: crypto.randomUUID().slice(0, 8), kind: "short_text", label: "New question", required: false }])}>+ Add</button>}>
      {fields.map((field, index) => (
        <div key={field.id} className="form-field-editor">
          <Row>
            <Select label={`Field ${index + 1}`} value={field.kind} options={FIELD_KINDS} onChange={(kind) => update(field.id, { kind, options: kind === "choice" ? field.options ?? [newOption("Option 1"), newOption("Option 2")] : field.options, max: kind === "rating" ? 5 : kind === "slider" ? 100 : undefined, min: kind === "slider" ? 0 : undefined, step: kind === "slider" ? 1 : undefined })} />
            <button type="button" className="icon-button" title="Remove field" onClick={() => onChange(fields.filter((item) => item.id !== field.id))}>✕</button>
          </Row>
          <TextInput label="Label" value={field.label} onChange={(label) => update(field.id, { label })} />
          {field.kind === "choice" && <OptionsEditor options={field.options ?? []} onOptions={(options) => update(field.id, { options })} />}
          {field.kind === "rating" && <NumberInput label="Maximum" value={field.max ?? 5} min={3} max={10} onChange={(max) => update(field.id, { max })} />}
          {field.kind === "slider" && <Row>
            <NumberInput label="Min" value={field.min ?? 0} onChange={(min) => update(field.id, { min })} />
            <NumberInput label="Max" value={field.max ?? 100} onChange={(max) => update(field.id, { max })} />
            <NumberInput label="Step" value={field.step ?? 1} min={0.01} onChange={(step) => update(field.id, { step })} />
          </Row>}
          <Toggle label="Required" checked={field.required} onChange={(required) => update(field.id, { required })} />
        </div>
      ))}
    </Section>
  );
}

function ImageSource({ label, value, onChange, presentationId, notify }: { label: string; value: string; onChange: (src: string) => void; presentationId: string; notify: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { onChange(await uploadImage(presentationId, file)); } catch (error) { notify((error as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="image-source">
      <TextInput label={`${label} URL`} value={value} placeholder="https://…" onChange={onChange} />
      <div className="image-source-actions">
        <label className="button-secondary" aria-busy={busy || undefined}><BusyLabel busy={busy} busyLabel="Uploading…">{value ? "Replace…" : "Upload…"}</BusyLabel><input type="file" accept={IMAGE_TYPES.join(",")} hidden onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
        {value && <button type="button" className="text-button" onClick={() => onChange("")}>Remove</button>}
      </div>
    </div>
  );
}

/** Formatting for the text currently being edited on the canvas. mousedown is prevented so the caret stays put. */
function RichTextToolbar() {
  const run = (command: string, value?: string) => document.execCommand(command, false, value);
  const button = (command: string, label: string, title: string, value?: string) => (
    <button type="button" title={title} data-keep-editing onMouseDown={(event) => { event.preventDefault(); run(command, value); document.querySelector<HTMLElement>("[data-text-editor]")?.dispatchEvent(new Event("input", { bubbles: true })); }}>{label}</button>
  );
  return (
    <div className="rich-toolbar">
      {button("bold", "B", "Bold (Ctrl+B)")}{button("italic", "I", "Italic (Ctrl+I)")}{button("underline", "U", "Underline (Ctrl+U)")}{button("strikeThrough", "S", "Strikethrough")}
      {button("insertUnorderedList", "•", "Bulleted list")}{button("insertOrderedList", "1.", "Numbered list")}
      {["#171a2e", "#ffffff", "#8b6cff", "#4f7bff", "#ff6fae", "#22c55e", "#f59e0b", "#ef4444"].map((color) => (
        <button key={color} type="button" className="swatch" title={`Color ${color}`} style={{ background: color }} data-keep-editing onMouseDown={(event) => { event.preventDefault(); run("foreColor", color); document.querySelector<HTMLElement>("[data-text-editor]")?.dispatchEvent(new Event("input", { bubbles: true })); }} />
      ))}
      <p className="hint">Double-click text on the slide to edit, then select words to format them.</p>
    </div>
  );
}
