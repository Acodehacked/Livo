import { CANVAS_HEIGHT, CANVAS_WIDTH, type ChoiceOption, type ElementOf, type ElementType, type ShapeKind, type Slide, type SlideElement } from "@livo/types";
import { defaultBackground } from "./doc";

export const BRAND = { navy: "#0b0d1a", ink: "#171a2e", violet: "#8b6cff", blue: "#4f7bff", sky: "#45b3ff", pink: "#ff6fae", white: "#ffffff" };
export const FONTS = ["Plus Jakarta Sans", "Inter", "Georgia", "Playfair Display", "JetBrains Mono", "Arial"];

const option = (label: string): ChoiceOption => ({ id: crypto.randomUUID().slice(0, 8), label });
const card = { fill: { type: "solid" as const, color: "#ffffff" }, radius: 24, borderColor: "#e6e8f2", borderWidth: 1, shadow: { x: 0, y: 12, blur: 40, color: "rgba(20,24,60,0.12)" }, textColor: BRAND.ink, accent: BRAND.blue };

type Box = { x?: number; y?: number; width: number; height: number };
const place = (box: Box) => ({ x: box.x ?? Math.round((CANVAS_WIDTH - box.width) / 2), y: box.y ?? Math.round((CANVAS_HEIGHT - box.height) / 2), width: box.width, height: box.height });

export const ELEMENT_LABELS: Record<ElementType, string> = {
  text: "Text", image: "Image", shape: "Shape", icon: "Icon", link: "Link", button: "Button",
  quiz: "Quiz", poll: "Poll", rating: "Rating", slider: "Slider", open_text: "Open text", form: "Form",
};

/** Creates a new element with defaults. `extra` overrides position, props or style. */
export function createElement<T extends ElementType>(type: T, extra: { box?: Partial<Box>; props?: Partial<ElementOf<T>["props"]>; style?: SlideElement["style"]; shape?: ShapeKind; zIndex?: number } = {}): ElementOf<T> {
  const base = { id: crypto.randomUUID(), rotation: 0, zIndex: extra.zIndex ?? 0, groupId: null, locked: false };
  const make = (box: Box, props: object, style?: SlideElement["style"]) =>
    ({ ...base, type, ...place({ ...box, ...extra.box } as Box), props: { ...props, ...extra.props }, style: { ...style, ...extra.style } }) as unknown as ElementOf<T>;

  switch (type) {
    case "text": return make({ width: 640, height: 120 }, { html: "Double-click to edit", fontSize: 40, fontFamily: FONTS[0], color: BRAND.ink, align: "left", valign: "top", lineHeight: 1.2 });
    case "image": return make({ width: 480, height: 320 }, { src: "", alt: "", fit: "cover", flipX: false, flipY: false, brightness: 100, contrast: 100, grayscale: 0, blur: 0 }, { radius: 16 });
    case "shape": {
      const shape = extra.shape ?? "rect";
      return make(shape === "line" ? { width: 360, height: 8 } : { width: 280, height: 200 }, { shape, text: "", textColor: BRAND.white, fontSize: 28 }, shape === "line" ? { fill: { type: "solid", color: BRAND.ink } } : { fill: { type: "linear", angle: 135, from: BRAND.violet, to: BRAND.blue }, radius: shape === "rect" ? 16 : 0 });
    }
    case "icon": return make({ width: 120, height: 120 }, { glyph: "🚀" });
    case "link": return make({ width: 360, height: 56 }, { label: "Open documentation →", url: "https://", color: BRAND.blue, fontSize: 26 });
    case "button": return make({ width: 280, height: 76 }, { label: "Click me", action: "respond", url: "https://", textColor: BRAND.white, fontSize: 26, results: "live" }, { fill: { type: "linear", angle: 90, from: BRAND.violet, to: BRAND.blue }, radius: 38, shadow: { x: 0, y: 10, blur: 24, color: "rgba(79,123,255,0.35)" } });
    case "quiz": return make({ width: 860, height: 480 }, { question: "What does API stand for?", mode: "single", options: [option("Application Programming Interface"), option("Automated Programming Interface"), option("Application Protocol Interface"), option("Advanced Programming Interface")], correct: [], points: 100, timeLimit: 30, required: false, results: "live", explanation: "", showCorrect: true, randomize: false, allowRetry: false }, card);
    case "poll": return make({ width: 820, height: 440 }, { question: "Which language do you prefer?", mode: "single", options: [option("Java"), option("Python"), option("JavaScript")], required: false, results: "live", allowChange: true }, card);
    case "rating": return make({ width: 760, height: 280 }, { question: "How useful was this session?", max: 5, icon: "star", allowHalf: false, required: false, results: "admin_only", allowChange: true }, card);
    case "slider": return make({ width: 760, height: 300 }, { question: "How confident are you with AI?", min: 0, max: 100, step: 1, unit: "", defaultValue: 50, minLabel: "Not at all", maxLabel: "Very", required: false, results: "admin_only", allowChange: true }, card);
    case "open_text": return make({ width: 760, height: 320 }, { question: "What would you like to learn next?", multiline: true, maxLength: 280, placeholder: "Type your answer…", required: false, results: "on_reveal", allowChange: true }, card);
    case "form": return make({ width: 760, height: 560 }, {
      title: "Workshop feedback", submitLabel: "Submit", results: "admin_only", allowChange: true,
      fields: [
        { id: crypto.randomUUID().slice(0, 8), kind: "short_text", label: "Name", required: false },
        { id: crypto.randomUUID().slice(0, 8), kind: "rating", label: "How useful?", required: true, max: 5 },
        { id: crypto.randomUUID().slice(0, 8), kind: "slider", label: "Confidence", required: false, min: 0, max: 100, step: 1 },
        { id: crypto.randomUUID().slice(0, 8), kind: "yesno", label: "Would you recommend this?", required: false },
      ],
    }, card);
  }
  throw new Error(`Unknown element type ${type}`);
}

export const newOption = option;

export function blankSlide(title = "Untitled slide", elements: SlideElement[] = []): Slide {
  return { id: crypto.randomUUID(), title, notes: "", background: defaultBackground(), elements: elements.map((element, index) => ({ ...element, zIndex: index })) };
}

/** Starter layouts offered by "Add slide". */
export const SLIDE_LAYOUTS: { id: string; label: string; build: () => Slide }[] = [
  { id: "blank", label: "Blank", build: () => blankSlide() },
  { id: "title", label: "Title", build: () => blankSlide("Title", [
    createElement("text", { box: { x: 120, y: 250, width: 1040, height: 130 }, props: { html: "<b>Presentation title</b>", fontSize: 72, align: "center" } }),
    createElement("text", { box: { x: 240, y: 390, width: 800, height: 60 }, props: { html: "Subtitle or speaker name", fontSize: 30, align: "center", color: "#5b6078" } }),
  ]) },
  { id: "content", label: "Title & body", build: () => blankSlide("Content", [
    createElement("text", { box: { x: 90, y: 70, width: 1100, height: 100 }, props: { html: "<b>Slide heading</b>", fontSize: 56 } }),
    createElement("text", { box: { x: 90, y: 200, width: 1100, height: 420 }, props: { html: "<ul><li>First point</li><li>Second point</li><li>Third point</li></ul>", fontSize: 32, lineHeight: 1.5, color: "#3b3f58" } }),
  ]) },
  { id: "quiz", label: "Quiz", build: () => blankSlide("Quiz", [createElement("quiz", { box: { y: 120 } })]) },
  { id: "poll", label: "Poll", build: () => blankSlide("Poll", [createElement("poll")]) },
  { id: "rating", label: "Rating", build: () => blankSlide("Rating", [createElement("rating")]) },
  { id: "feedback", label: "Feedback form", build: () => blankSlide("Feedback", [createElement("form", { box: { y: 80 } })]) },
];
