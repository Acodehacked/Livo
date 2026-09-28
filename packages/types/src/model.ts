// Presentation document model. Supabase owns this; clients load it once and the
// realtime layer only ever references slides/interactions by id.

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

export type SlideType = "normal" | "interactive";
export type RoomRole = "admin" | "presenter" | "participant";
export type RoomStatus = "draft" | "ready" | "live" | "paused" | "ended";

export type Fill =
  | { type: "none" }
  | { type: "solid"; color: string }
  | { type: "linear"; angle: number; from: string; to: string };

export interface Shadow { x: number; y: number; blur: number; color: string }

export interface ElementStyle {
  fill?: Fill;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted";
  radius?: number;
  shadow?: Shadow | null;
  opacity?: number;
  textColor?: string;  // interactive cards and buttons
  accent?: string;     // result bars, selected options
}

export type ShapeKind = "rect" | "ellipse" | "triangle" | "diamond" | "pentagon" | "hexagon" | "star" | "arrow" | "chevron" | "bubble" | "heart" | "line";
export type ResultsVisibility = "live" | "on_reveal" | "admin_only";

export interface ChoiceOption { id: string; label: string }

export interface TextProps { html: string; fontSize: number; fontFamily: string; color: string; align: "left" | "center" | "right"; valign: "top" | "middle" | "bottom"; lineHeight: number }
export interface ImageProps { src: string; alt: string; fit: "cover" | "contain" | "fill"; flipX: boolean; flipY: boolean; brightness: number; contrast: number; grayscale: number; blur: number }
export interface ShapeProps { shape: ShapeKind; text: string; textColor: string; fontSize: number }
export interface IconProps { glyph: string }
export interface LinkProps { label: string; url: string; color: string; fontSize: number }
export interface ButtonProps { label: string; action: "link" | "respond"; url: string; textColor: string; fontSize: number; results: ResultsVisibility }

export interface QuizProps {
  question: string;
  mode: "single" | "multiple" | "yesno" | "text";
  options: ChoiceOption[];
  correct: string[];              // option ids, or accepted answers for mode "text"
  points: number;
  timeLimit: number;              // seconds, 0 = no limit
  required: boolean;
  results: ResultsVisibility;
  explanation: string;
  showCorrect: boolean;
  randomize: boolean;
  allowRetry: boolean;
}
export interface PollProps { question: string; mode: "single" | "multiple" | "yesno"; options: ChoiceOption[]; required: boolean; results: ResultsVisibility; allowChange: boolean }
export interface RatingProps { question: string; max: number; icon: "star" | "heart" | "thumb"; allowHalf: boolean; required: boolean; results: ResultsVisibility; allowChange: boolean }
export interface SliderProps { question: string; min: number; max: number; step: number; unit: string; defaultValue: number; minLabel: string; maxLabel: string; required: boolean; results: ResultsVisibility; allowChange: boolean }
export interface OpenTextProps { question: string; multiline: boolean; maxLength: number; placeholder: string; required: boolean; results: ResultsVisibility; allowChange: boolean }

export type FormFieldKind = "short_text" | "long_text" | "rating" | "slider" | "choice" | "yesno";
export interface FormField { id: string; kind: FormFieldKind; label: string; required: boolean; options?: ChoiceOption[]; min?: number; max?: number; step?: number }
export interface FormProps { title: string; fields: FormField[]; submitLabel: string; results: ResultsVisibility; allowChange: boolean }

interface ElementBase {
  id: string;
  x: number; y: number; width: number; height: number;
  rotation: number;
  zIndex: number;
  name?: string;
  groupId?: string | null;
  locked?: boolean;
  style?: ElementStyle;
}

export type SlideElement = ElementBase & (
  | { type: "text"; props: TextProps }
  | { type: "image"; props: ImageProps }
  | { type: "shape"; props: ShapeProps }
  | { type: "icon"; props: IconProps }
  | { type: "link"; props: LinkProps }
  | { type: "button"; props: ButtonProps }
  | { type: "quiz"; props: QuizProps }
  | { type: "poll"; props: PollProps }
  | { type: "rating"; props: RatingProps }
  | { type: "slider"; props: SliderProps }
  | { type: "open_text"; props: OpenTextProps }
  | { type: "form"; props: FormProps }
);
export type ElementType = SlideElement["type"];
export type ElementOf<T extends ElementType> = Extract<SlideElement, { type: T }>;

export interface SlideBackground { fill: Fill; image?: { src: string; fit: "cover" | "contain"; opacity: number } | null }
export interface Slide { id: string; title: string; notes: string; background: SlideBackground; elements: SlideElement[] }
export interface PresentationDoc { id: string; title: string; slides: Slide[] }

// --- Interactions -------------------------------------------------------------

export const INTERACTIVE_TYPES = ["quiz", "poll", "rating", "slider", "open_text", "form"] as const;
export type InteractionKind = (typeof INTERACTIVE_TYPES)[number] | "button";

/** The server-side view of one interactive element: everything needed to validate, score and aggregate. */
export type InteractionConfig =
  | { id: string; kind: "quiz"; config: QuizProps }
  | { id: string; kind: "poll"; config: PollProps }
  | { id: string; kind: "rating"; config: RatingProps }
  | { id: string; kind: "slider"; config: SliderProps }
  | { id: string; kind: "open_text"; config: OpenTextProps }
  | { id: string; kind: "form"; config: FormProps }
  | { id: string; kind: "button"; config: ButtonProps };

export function interactionOf(element: SlideElement): InteractionConfig | null {
  switch (element.type) {
    case "quiz": case "poll": case "rating": case "slider": case "open_text": case "form":
      return { id: element.id, kind: element.type, config: element.props } as InteractionConfig;
    case "button":
      return element.props.action === "respond" ? { id: element.id, kind: "button", config: element.props } : null;
    default:
      return null;
  }
}

export const slideInteractions = (slide: Slide | undefined): InteractionConfig[] =>
  (slide?.elements ?? []).map(interactionOf).filter((item): item is InteractionConfig => item !== null);

export const slideType = (slide: Slide): SlideType => (slideInteractions(slide).length ? "interactive" : "normal");

export const interactionTitle = (item: InteractionConfig): string =>
  item.kind === "form" ? item.config.title : item.kind === "button" ? item.config.label : item.config.question;

export const resultsVisibility = (item: InteractionConfig): ResultsVisibility => item.config.results;

export const YES_NO: ChoiceOption[] = [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }];

/** Options shown to the audience, with yes/no expanded. */
export function choiceOptions(item: { mode: string; options: ChoiceOption[] }): ChoiceOption[] {
  return item.mode === "yesno" ? YES_NO : item.options;
}

/** Removes answer keys so a presentation can be sent to audience devices. */
export function publicDoc(doc: PresentationDoc): PresentationDoc {
  return {
    ...doc,
    slides: doc.slides.map((slide) => ({
      ...slide,
      notes: "",
      elements: slide.elements.map((element) =>
        element.type === "quiz" ? { ...element, props: { ...element.props, correct: [], explanation: "" } } : element
      ),
    })),
  };
}
