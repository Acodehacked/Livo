"use client";
// Client-side export of the deck being edited. Both libraries are large, so they're loaded on demand.
import type PptxGenJS from "pptxgenjs";
import { CANVAS_WIDTH, choiceOptions, interactionOf, interactionTitle, slideType, type ElementStyle, type Fill, type PresentationDoc, type ShapeKind, type Slide, type SlideElement } from "@livo/types";
import { sanitizeHtml } from "@/lib/sanitize";

// --- Shared helpers -----------------------------------------------------------------

const IN = 13.333 / CANVAS_WIDTH;          // canvas px → inches on a 16:9 (LAYOUT_WIDE) slide
const PT = 0.75;                           // CSS px → points
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const fileName = (title: string, extension: string) => `${title.trim().replace(/[\\/:*?"<>|]+/g, "").slice(0, 80) || "Presentation"}.${extension}`;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let colorContext: CanvasRenderingContext2D | null = null;

/** Any CSS color → PowerPoint hex + transparency (percent). The canvas normalises named colors and hsl(). */
function toColor(value: string | undefined, opacity = 1): { color: string; transparency: number } | null {
  if (!value || value === "transparent" || value === "none") return null;
  colorContext ??= document.createElement("canvas").getContext("2d");
  if (!colorContext) return null;
  colorContext.fillStyle = "#000000";
  colorContext.fillStyle = value;
  const normal = String(colorContext.fillStyle);
  let hex = "000000";
  let alpha = 1;
  const rgba = normal.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/);
  if (normal.startsWith("#")) hex = normal.slice(1, 7);
  else if (rgba) { hex = rgba.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join(""); alpha = rgba[4] ? Number(rgba[4]) : 1; }
  if (alpha * opacity <= 0) return null;
  return { color: hex.toUpperCase(), transparency: Math.round((1 - alpha * opacity) * 100) };
}

/** PowerPoint has no CSS gradients, so a linear fill exports as its starting color. */
const fillColor = (fill: Fill | undefined) => (!fill || fill.type === "none" ? undefined : fill.type === "solid" ? fill.color : fill.from);

const fontFace = (family: string) => family.split(",")[0]?.trim().replace(/^["']|["']$/g, "") || "Arial";

async function toDataUrl(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:")) return src;
  try {
    const response = await fetch(src, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => resolve(null); reader.readAsDataURL(blob); });
  } catch {
    return null; // e.g. a host without CORS headers: skip the image rather than fail the export
  }
}

type Runs = PptxGenJS.TextProps[];

/** Rich text from the editor → PowerPoint text runs, keeping bold/italic/underline/color/size, links and line breaks. */
function htmlRuns(html: string): Runs {
  const root = new DOMParser().parseFromString(`<div>${sanitizeHtml(html)}</div>`, "text/html").body.firstElementChild;
  const runs: Runs = [];
  const BLOCKS = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "UL", "OL"]);
  const breakLine = () => {
    const last = runs.at(-1);
    if (last && !last.options?.breakLine) last.options = { ...last.options, breakLine: true };
  };
  const walk = (node: Node, format: PptxGenJS.TextPropsOptions) => {
    if (node.nodeType === Node.TEXT_NODE) { if (node.textContent) runs.push({ text: node.textContent, options: { ...format } }); return; }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (tag === "BR") { if (runs.length && !runs.at(-1)!.options?.breakLine) breakLine(); else runs.push({ text: "", options: { ...format, breakLine: true } }); return; }
    const next = { ...format };
    if (["B", "STRONG", "H1", "H2", "H3"].includes(tag) || /^(bold|[6-9]00)$/.test(node.style.fontWeight)) next.bold = true;
    if (["I", "EM"].includes(tag) || node.style.fontStyle === "italic") next.italic = true;
    if (tag === "U" || node.style.textDecoration.includes("underline")) next.underline = { style: "sng" };
    if (["S", "STRIKE"].includes(tag) || node.style.textDecoration.includes("line-through")) next.strike = "sngStrike";
    const color = toColor(node.style.color);
    if (color) next.color = color.color;
    const size = parseFloat(node.style.fontSize);
    if (node.style.fontSize.endsWith("px") && size) next.fontSize = size * PT;
    if (tag === "A") { const href = node.getAttribute("href") ?? ""; if (/^https?:\/\//i.test(href)) next.hyperlink = { url: href }; }
    if (tag === "LI") next.bullet = true;
    if (BLOCKS.has(tag)) breakLine();
    node.childNodes.forEach((child) => walk(child, next));
    if (BLOCKS.has(tag)) breakLine();
  };
  if (root) walk(root, {});
  const last = runs.at(-1);
  if (last?.options?.breakLine) last.options = { ...last.options, breakLine: false };
  return runs;
}

const plainText = (html: string) => htmlRuns(html).map((run) => run.text + (run.options?.breakLine ? "\n" : "")).join("").trim();

// --- PowerPoint ------------------------------------------------------------------------

const SHAPES: Record<ShapeKind, string> = {
  rect: "rect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond", pentagon: "pentagon", hexagon: "hexagon", star: "star5",
  arrow: "rightArrow", chevron: "chevron", bubble: "wedgeRoundRectCallout", heart: "heart", line: "roundRect",
};

/** Position, rotation, fill, border and shadow shared by every element. */
function frame(element: SlideElement, extra: { shape?: string } = {}): PptxGenJS.TextPropsOptions {
  const style: ElementStyle = element.style ?? {};
  const opacity = style.opacity ?? 1;
  const fill = toColor(fillColor(style.fill), opacity);
  const border = style.borderWidth ? toColor(style.borderColor ?? "#000000", opacity) : null;
  const shadow = style.shadow ? toColor(style.shadow.color) : null;
  let shape = extra.shape;
  if (!shape && style.radius) shape = "roundRect";
  return {
    x: element.x * IN, y: element.y * IN, w: element.width * IN, h: element.height * IN,
    rotate: element.rotation || undefined,
    shape: shape as PptxGenJS.ShapeType | undefined,
    rectRadius: shape === "roundRect" ? (element.type === "shape" && element.props.shape === "line" ? element.height / 2 : style.radius ?? 0) * IN : undefined,
    fill: fill ? { color: fill.color, transparency: fill.transparency } : undefined,
    line: border ? { color: border.color, transparency: border.transparency, width: style.borderWidth! * PT, dashType: style.borderStyle === "dashed" ? "dash" : style.borderStyle === "dotted" ? "sysDot" : "solid" } : undefined,
    shadow: style.shadow && shadow ? {
      type: "outer", color: shadow.color, opacity: 1 - shadow.transparency / 100, blur: style.shadow.blur * PT,
      offset: Math.hypot(style.shadow.x, style.shadow.y) * PT, angle: ((Math.atan2(style.shadow.y, style.shadow.x) * 180) / Math.PI + 360) % 360,
    } : undefined,
    margin: 0,
  };
}

/** Interactive elements become a static card: question plus its options, so the deck still reads offline. */
function cardRuns(element: SlideElement): Runs {
  const style = element.style ?? {};
  const accent = toColor(style.accent ?? "#4f7bff")?.color;
  const kicker = (text: string): Runs => [{ text, options: { bold: true, fontSize: 11, color: accent, breakLine: true } }];
  const heading = (text: string): Runs => [{ text: text || " ", options: { bold: true, fontSize: 20, breakLine: true, paraSpaceAfter: 6 } }];
  const lines = (items: string[], options: PptxGenJS.TextPropsOptions = {}): Runs => items.map((text) => ({ text, options: { fontSize: 14, breakLine: true, paraSpaceAfter: 4, ...options } }));
  switch (element.type) {
    case "quiz": case "poll": {
      const props = element.props;
      const label = element.type === "quiz" ? "QUIZ" : "POLL";
      if (element.type === "quiz" && props.mode === "text") return [...kicker(label), ...heading(props.question), ...lines(["Type your answer"], { italic: true, color: "8A8FA8" })];
      return [...kicker(`${label}${props.mode === "multiple" ? " · select all that apply" : ""}`), ...heading(props.question), ...lines(choiceOptions(props).map((option, index) => `${LETTERS[index]}.  ${option.label}`))];
    }
    case "rating": {
      const { question, max, icon } = element.props;
      return [...kicker("RATING"), ...heading(question), ...lines([(icon === "heart" ? "♥" : icon === "thumb" ? "👍" : "★").repeat(max)], { fontSize: 24, color: accent })];
    }
    case "slider": {
      const { question, min, max, unit, minLabel, maxLabel } = element.props;
      return [...kicker("SLIDER"), ...heading(question), ...lines([`${min}${unit} ${minLabel}  ———————  ${maxLabel} ${max}${unit}`])];
    }
    case "open_text": return [...kicker("OPEN QUESTION"), ...heading(element.props.question), ...lines([element.props.placeholder || "Type your answer"], { italic: true, color: "8A8FA8" })];
    case "form": return [...kicker("FORM"), ...heading(element.props.title), ...lines(element.props.fields.map((field) => `•  ${field.label}${field.required ? " *" : ""}`))];
    default: return [];
  }
}

/** Speaker notes plus the quiz answer key, which never appears on the slides themselves. */
function notesFor(slide: Slide): string {
  const key = slide.elements.flatMap((element) => {
    if (element.type !== "quiz") return [];
    const { question, mode, correct, explanation } = element.props;
    const options = choiceOptions(element.props);
    const answer = mode === "text" ? correct.join(" / ") : correct.map((id) => { const index = options.findIndex((option) => option.id === id); return index < 0 ? id : `${LETTERS[index]}. ${options[index].label}`; }).join(", ");
    return [`Q: ${question}\nAnswer: ${answer || "—"}${explanation ? `\n${explanation}` : ""}`];
  });
  return [slide.notes.trim(), key.length ? `Answer key\n${key.join("\n\n")}` : ""].filter(Boolean).join("\n\n");
}

/** Adds one element to the slide. Returns false when an image couldn't be fetched and was left out. */
async function addElement(target: PptxGenJS.Slide, element: SlideElement): Promise<boolean> {
  const opacity = element.style?.opacity ?? 1;
  const textColor = (value: string | undefined) => toColor(value ?? "#171a2e")?.color;
  switch (element.type) {
    case "text": {
      const { html, fontSize, fontFamily, color, align, valign, lineHeight } = element.props;
      target.addText(htmlRuns(html), { ...frame(element), fontSize: fontSize * PT, fontFace: fontFace(fontFamily), color: textColor(color), align, valign, lineSpacingMultiple: lineHeight, transparency: Math.round((1 - opacity) * 100) });
      break;
    }
    case "image": {
      const { src, alt, fit, flipX, flipY } = element.props;
      const data = await toDataUrl(src);
      if (!data) return !src;
      const { x, y, w, h } = frame(element);
      target.addImage({ data, altText: alt, x, y, w, h, rotate: element.rotation || undefined, flipH: flipX, flipV: flipY, transparency: Math.round((1 - opacity) * 100), sizing: fit === "fill" ? undefined : { type: fit, w: w as number, h: h as number } });
      break;
    }
    case "shape": {
      const { shape, text, textColor: color, fontSize } = element.props;
      target.addText(text || "", { ...frame(element, { shape: SHAPES[shape] }), color: textColor(color), fontSize: fontSize * PT, align: "center", valign: "middle" });
      break;
    }
    case "icon":
      target.addText(element.props.glyph, { ...frame(element), fontSize: Math.min(element.width, element.height) * 0.8 * PT, align: "center", valign: "middle" });
      break;
    case "link": {
      const { label, url, color, fontSize } = element.props;
      target.addText([{ text: label, options: /^https?:\/\//i.test(url) ? { hyperlink: { url } } : {} }], { ...frame(element), color: textColor(color), fontSize: fontSize * PT, underline: { style: "sng" }, valign: "middle" });
      break;
    }
    case "button": {
      const { label, textColor: color, fontSize, action, url } = element.props;
      const link = action === "link" && /^https?:\/\//i.test(url) ? { hyperlink: { url } } : {};
      target.addText([{ text: label, options: link }], { ...frame(element, { shape: element.style?.radius ? "roundRect" : "rect" }), color: textColor(color), fontSize: fontSize * PT, bold: true, align: "center", valign: "middle" });
      break;
    }
    default: {
      const base = frame(element);
      target.addText(cardRuns(element), { ...base, fill: base.fill ?? { color: "FFFFFF" }, color: textColor(element.style?.textColor), valign: "top", margin: 16 * PT });
    }
  }
  return true;
}

export async function exportPptx(doc: PresentationDoc): Promise<{ skippedImages: number }> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = doc.title;
  let skippedImages = 0;
  for (const slide of doc.slides) {
    const target = pptx.addSlide();
    target.background = { color: toColor(fillColor(slide.background.fill) ?? "#ffffff")?.color ?? "FFFFFF" };
    const image = slide.background.image;
    if (image?.src) {
      const data = await toDataUrl(image.src);
      if (data) target.addImage({ data, x: 0, y: 0, w: "100%", h: "100%", sizing: { type: image.fit, w: 13.333, h: 7.5 }, transparency: Math.round((1 - image.opacity) * 100) });
      else skippedImages++;
    }
    for (const element of [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)) if (!(await addElement(target, element))) skippedImages++;
    const notes = notesFor(slide);
    if (notes) target.addNotes(notes);
  }
  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  download(blob, fileName(doc.title, "pptx"));
  return { skippedImages };
}

// --- Excel ---------------------------------------------------------------------------------

const RESULTS_LABEL = { live: "Live", on_reveal: "On reveal", admin_only: "Presenter only" } as const;
const KIND_LABEL = { quiz: "Quiz", poll: "Poll", rating: "Rating", slider: "Slider", open_text: "Open text", form: "Form", button: "Button" } as const;

function slideText(slide: Slide): string {
  return slide.elements.flatMap((element) => {
    switch (element.type) {
      case "text": return [plainText(element.props.html)];
      case "shape": return [element.props.text];
      case "link": case "button": return [element.props.label];
      default: return [];
    }
  }).filter(Boolean).join("\n");
}

/** One row per interactive element: what it asks, the options, and (for quizzes) the answer key. */
function interactionRows(doc: PresentationDoc) {
  return doc.slides.flatMap((slide, index) => slide.elements.flatMap((element) => {
    const item = interactionOf(element);
    if (!item) return [];
    const row = { slide: index + 1, slideTitle: slide.title, type: KIND_LABEL[item.kind], question: interactionTitle(item), mode: "", options: "", correct: "", points: null as number | null, timeLimit: null as number | null, required: "", results: RESULTS_LABEL[item.config.results] };
    switch (item.kind) {
      case "quiz": {
        const options = choiceOptions(item.config);
        Object.assign(row, {
          mode: item.config.mode, points: item.config.points, timeLimit: item.config.timeLimit || null, required: item.config.required ? "Yes" : "No",
          options: item.config.mode === "text" ? "" : options.map((option, i) => `${LETTERS[i]}. ${option.label}`).join("\n"),
          correct: item.config.mode === "text" ? item.config.correct.join(" / ") : item.config.correct.map((id) => options.find((option) => option.id === id)?.label ?? id).join(", "),
        });
        break;
      }
      case "poll": Object.assign(row, { mode: item.config.mode, required: item.config.required ? "Yes" : "No", options: choiceOptions(item.config).map((option, i) => `${LETTERS[i]}. ${option.label}`).join("\n") }); break;
      case "rating": Object.assign(row, { mode: `1–${item.config.max} ${item.config.icon}`, required: item.config.required ? "Yes" : "No" }); break;
      case "slider": Object.assign(row, { mode: `${item.config.min}–${item.config.max}${item.config.unit} (step ${item.config.step})`, required: item.config.required ? "Yes" : "No" }); break;
      case "open_text": Object.assign(row, { mode: item.config.multiline ? "Multi-line" : "Single line", required: item.config.required ? "Yes" : "No" }); break;
      case "form": Object.assign(row, { options: item.config.fields.map((field) => `${field.label} (${field.kind.replace("_", " ")}${field.required ? ", required" : ""})`).join("\n") }); break;
      case "button": break;
    }
    return [row];
  }));
}

export async function exportXlsx(doc: PresentationDoc) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.title = doc.title;
  workbook.creator = "Livo";
  workbook.created = new Date();

  const style = (sheet: import("exceljs").Worksheet) => {
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F7BFF" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
    sheet.eachRow((row, number) => { if (number > 1) row.alignment = { vertical: "top", wrapText: true }; });
  };

  const slides = workbook.addWorksheet("Slides");
  slides.columns = [
    { header: "#", key: "number", width: 6 }, { header: "Title", key: "title", width: 28 }, { header: "Type", key: "type", width: 13 },
    { header: "Text on slide", key: "text", width: 60 }, { header: "Interactions", key: "interactions", width: 13 }, { header: "Speaker notes", key: "notes", width: 50 },
  ];
  doc.slides.forEach((slide, index) => slides.addRow({
    number: index + 1, title: slide.title, type: slideType(slide) === "interactive" ? "Interactive" : "Normal", text: slideText(slide),
    interactions: slide.elements.filter((element) => interactionOf(element)).length, notes: slide.notes,
  }));
  style(slides);

  const interactions = workbook.addWorksheet("Interactions");
  interactions.columns = [
    { header: "Slide", key: "slide", width: 7 }, { header: "Slide title", key: "slideTitle", width: 24 }, { header: "Type", key: "type", width: 11 },
    { header: "Question / title", key: "question", width: 44 }, { header: "Mode", key: "mode", width: 16 }, { header: "Options / fields", key: "options", width: 40 },
    { header: "Correct answer", key: "correct", width: 28 }, { header: "Points", key: "points", width: 8 }, { header: "Time limit (s)", key: "timeLimit", width: 13 },
    { header: "Required", key: "required", width: 10 }, { header: "Results shown", key: "results", width: 15 },
  ];
  interactionRows(doc).forEach((row) => interactions.addRow(row));
  style(interactions);

  const buffer = await workbook.xlsx.writeBuffer();
  download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName(doc.title, "xlsx"));
}
