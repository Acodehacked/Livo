"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, choiceOptions, type Aggregate, type ElementOf, type ElementStyle, type Fill, type ShapeKind, type Slide, type SlideElement } from "@livo/types";
import { sanitizeHtml } from "@/lib/sanitize";

// --- Stage: fixed 1280×720 logical canvas scaled to its container ---------------

export function Stage({ children, fit = "width", className = "", onScale }: { children: ReactNode; fit?: "width" | "contain"; className?: string; onScale?: (scale: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const element = ref.current!;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const next = fit === "contain" ? Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT) : width / CANVAS_WIDTH;
      setScale(next);
      onScale?.(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit, onScale]);
  return (
    <div ref={ref} className={`stage stage-${fit} ${className}`}>
      <div className="stage-frame" style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
        <div className="stage-canvas" style={{ transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}>{children}</div>
      </div>
    </div>
  );
}

// --- Style helpers ----------------------------------------------------------------

export const fillCss = (fill: Fill | undefined, fallback = "transparent") =>
  !fill || fill.type === "none" ? fallback : fill.type === "solid" ? fill.color : `linear-gradient(${fill.angle}deg, ${fill.from}, ${fill.to})`;

const shadowCss = (style?: ElementStyle) => (style?.shadow ? `${style.shadow.x}px ${style.shadow.y}px ${style.shadow.blur}px ${style.shadow.color}` : undefined);

export function boxStyle(element: SlideElement): CSSProperties {
  return { position: "absolute", left: element.x, top: element.y, width: element.width, height: element.height, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined, zIndex: element.zIndex, opacity: element.style?.opacity ?? 1 };
}

function surfaceStyle(style: ElementStyle | undefined): CSSProperties {
  return {
    background: fillCss(style?.fill),
    borderRadius: style?.radius ?? 0,
    border: style?.borderWidth ? `${style.borderWidth}px ${style.borderStyle ?? "solid"} ${style.borderColor ?? "#000"}` : undefined,
    boxShadow: shadowCss(style),
  };
}

export function SlideBackdrop({ slide }: { slide: Slide }) {
  const image = slide.background.image;
  return (
    <div className="slide-bg" style={{ background: fillCss(slide.background.fill, "#ffffff") }}>
      {image?.src && <div className="slide-bg-image" style={{ backgroundImage: `url("${encodeURI(image.src)}")`, backgroundSize: image.fit, opacity: image.opacity }} />}
    </div>
  );
}

// --- Slide ------------------------------------------------------------------------

export interface RenderContext {
  results?: Record<string, Aggregate>;
  correct?: Record<string, string[]>;   // revealed correct option ids per quiz
  linksEnabled?: boolean;
}

export function SlideView({ slide, context = {} }: { slide: Slide; context?: RenderContext }) {
  const elements = useMemo(() => [...slide.elements].sort((a, b) => a.zIndex - b.zIndex), [slide.elements]);
  return (
    <div className="slide">
      <SlideBackdrop slide={slide} />
      {elements.map((element) => <div key={element.id} style={boxStyle(element)}><ElementBody element={element} context={context} /></div>)}
    </div>
  );
}

/** A non-interactive miniature of a slide (thumbnails, controller previews). */
export function SlideThumb({ slide, context, className = "" }: { slide: Slide | undefined; context?: RenderContext; className?: string }) {
  return <Stage className={`thumb ${className}`}>{slide ? <SlideView slide={slide} context={context} /> : <div className="slide slide-empty" />}</Stage>;
}

// --- Element bodies ------------------------------------------------------------------

export function ElementBody({ element, context = {} }: { element: SlideElement; context?: RenderContext }) {
  switch (element.type) {
    case "text": return <TextBody element={element} />;
    case "image": return <ImageBody element={element} />;
    case "shape": return <ShapeBody element={element} />;
    case "icon": return <div className="el-icon" style={{ fontSize: Math.min(element.width, element.height) * 0.8 }}>{element.props.glyph}</div>;
    case "link": {
      const { label, url, color, fontSize } = element.props;
      const safe = /^https?:\/\//i.test(url);
      return <a className="el-link" style={{ color, fontSize }} href={context.linksEnabled && safe ? url : undefined} target="_blank" rel="noopener noreferrer">{label}</a>;
    }
    case "button": {
      const { label, textColor, fontSize, action, url } = element.props;
      const clicks = context.results?.[element.id];
      const content = <>{label}{clicks?.kind === "clicks" && <span className="el-button-count">{clicks.total}</span>}</>;
      const style = { ...surfaceStyle(element.style), color: textColor, fontSize };
      return action === "link" && context.linksEnabled && /^https?:\/\//i.test(url)
        ? <a className="el-button" style={style} href={url} target="_blank" rel="noopener noreferrer">{content}</a>
        : <div className="el-button" style={style}>{content}</div>;
    }
    default: return <InteractiveCard element={element} context={context} />;
  }
}

export function TextBody({ element }: { element: ElementOf<"text"> }) {
  const { html, fontSize, fontFamily, color, align, valign, lineHeight } = element.props;
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  return (
    <div className="el-text" style={{ ...surfaceStyle(element.style), fontSize, fontFamily, color, textAlign: align, lineHeight, justifyContent: valign === "middle" ? "center" : valign === "bottom" ? "flex-end" : "flex-start" }}>
      <div dangerouslySetInnerHTML={{ __html: clean }} />
    </div>
  );
}

function ImageBody({ element }: { element: ElementOf<"image"> }) {
  const { src, alt, fit, flipX, flipY, brightness, contrast, grayscale, blur } = element.props;
  const style = surfaceStyle(element.style);
  if (!src) return <div className="el-image-empty" style={style}>Image</div>;
  return (
    <div className="el-image" style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} style={{ objectFit: fit, transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`, filter: `brightness(${brightness}%) contrast(${contrast}%) grayscale(${grayscale}%) blur(${blur}px)` }} />
    </div>
  );
}

const star = (() => {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 21 : 50; const a = (Math.PI / 5) * i - Math.PI / 2; points.push(`${50 + r * Math.cos(a)},${50 + r * Math.sin(a) * 1.05 + 3}`); }
  return points.join(" ");
})();

const SHAPE_PATHS: Partial<Record<ShapeKind, { polygon?: string; path?: string }>> = {
  triangle: { polygon: "50,0 100,100 0,100" },
  diamond: { polygon: "50,0 100,50 50,100 0,50" },
  pentagon: { polygon: "50,0 100,38 81,100 19,100 0,38" },
  hexagon: { polygon: "25,0 75,0 100,50 75,100 25,100 0,50" },
  star: { polygon: star },
  arrow: { polygon: "0,30 60,30 60,0 100,50 60,100 60,70 0,70" },
  chevron: { polygon: "0,0 70,0 100,50 70,100 0,100 30,50" },
  bubble: { path: "M8,0 H92 Q100,0 100,8 V64 Q100,72 92,72 H40 L20,100 L24,72 H8 Q0,72 0,64 V8 Q0,0 8,0 Z" },
  heart: { path: "M50,96 C20,73 0,56 0,31 C0,13 14,1 30,1 C40,1 47,7 50,15 C53,7 60,1 70,1 C86,1 100,13 100,31 C100,56 80,73 50,96 Z" },
};

function ShapeBody({ element }: { element: ElementOf<"shape"> }) {
  const { shape, text, textColor, fontSize } = element.props;
  const style = element.style ?? {};
  const label = text ? <span className="el-shape-text" style={{ color: textColor, fontSize }}>{text}</span> : null;
  if (shape === "rect" || shape === "ellipse" || shape === "line") {
    return <div className="el-shape" style={{ ...surfaceStyle(style), borderRadius: shape === "ellipse" ? "50%" : shape === "line" ? element.height : style.radius ?? 0 }}>{label}</div>;
  }
  const geometry = SHAPE_PATHS[shape]!;
  const gradientId = `g-${element.id}`;
  const fill = style.fill;
  const paint = !fill || fill.type === "none" ? "none" : fill.type === "solid" ? fill.color : `url(#${gradientId})`;
  const stroke = { stroke: style.borderWidth ? style.borderColor : "none", strokeWidth: style.borderWidth ?? 0, strokeDasharray: style.borderStyle === "dashed" ? "8 6" : style.borderStyle === "dotted" ? "2 4" : undefined, vectorEffect: "non-scaling-stroke" as const };
  return (
    <div className="el-shape" style={{ filter: style.shadow ? `drop-shadow(${shadowCss(style)})` : undefined }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
        {fill?.type === "linear" && <defs><linearGradient id={gradientId} gradientTransform={`rotate(${fill.angle - 90} .5 .5)`}><stop offset="0" stopColor={fill.from} /><stop offset="1" stopColor={fill.to} /></linearGradient></defs>}
        {geometry.polygon ? <polygon points={geometry.polygon} fill={paint} {...stroke} /> : <path d={geometry.path} fill={paint} {...stroke} />}
      </svg>
      {label}
    </div>
  );
}

// --- Interactive cards (quiz, poll, rating, slider, open text, form) --------------------

const percent = (count: number, total: number) => (total ? Math.round((count / total) * 100) : 0);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function ChoiceBars({ options, aggregate, correct, accent }: { options: { id: string; label: string }[]; aggregate?: Aggregate; correct?: string[]; accent: string }) {
  const counts = aggregate?.kind === "choice" ? aggregate.counts : undefined;
  const total = aggregate?.kind === "choice" ? aggregate.total : 0;
  return (
    <ol className="choice-bars">
      {options.map((option, index) => {
        const count = counts?.[option.id] ?? 0;
        const isCorrect = correct?.includes(option.id);
        return (
          <li key={option.id} className={isCorrect ? "is-correct" : correct?.length ? "is-dim" : ""}>
            <span className="choice-fill" style={{ width: counts ? `${percent(count, total)}%` : 0, background: isCorrect ? "#22c55e" : accent }} />
            <b className="choice-letter" style={{ borderColor: accent }}>{isCorrect ? "✓" : LETTERS[index]}</b>
            <span className="choice-label">{option.label}</span>
            {counts && <span className="choice-count">{percent(count, total)}% <small>{count}</small></span>}
          </li>
        );
      })}
    </ol>
  );
}

function NumericSummary({ aggregate, max, min = 0, unit = "", icon }: { aggregate?: Aggregate; max: number; min?: number; unit?: string; icon?: string }) {
  if (aggregate?.kind !== "numeric" || !aggregate.total) return null;
  const position = ((aggregate.average - min) / (max - min || 1)) * 100;
  return (
    <div className="numeric-summary">
      <strong>{aggregate.average.toFixed(1)}{unit}{icon && <span> / {max} {icon}</span>}</strong>
      <span className="numeric-track"><i style={{ left: `${Math.min(100, Math.max(0, position))}%` }} /></span>
      <small>{aggregate.total} responses</small>
    </div>
  );
}

const RATING_ICON = { star: "★", heart: "♥", thumb: "👍" };

function InteractiveCard({ element, context }: { element: SlideElement; context: RenderContext }) {
  const style = element.style ?? {};
  const accent = style.accent ?? "#4f7bff";
  const aggregate = context.results?.[element.id];
  const cardStyle: CSSProperties = { ...surfaceStyle(style), color: style.textColor ?? "#171a2e" };
  const total = aggregate && "total" in aggregate ? aggregate.total : undefined;
  const footer = total !== undefined && <div className="card-footer">{total} {total === 1 ? "response" : "responses"}{aggregate?.kind === "choice" && aggregate.correct !== undefined && total ? ` · ${percent(aggregate.correct, total)}% correct` : ""}</div>;

  switch (element.type) {
    case "quiz": case "poll": {
      const props = element.props;
      if (element.type === "quiz" && props.mode === "text") {
        return <div className="card" style={cardStyle}><h3>{props.question}</h3><TextWall aggregate={aggregate} />{footer}</div>;
      }
      return (
        <div className="card" style={cardStyle}>
          <div className="card-kicker" style={{ color: accent }}>{element.type === "quiz" ? "Quiz" : "Poll"}{element.type === "quiz" && props.mode === "multiple" ? " · select all that apply" : ""}</div>
          <h3>{props.question}</h3>
          <ChoiceBars options={choiceOptions(props as { mode: string; options: { id: string; label: string }[] })} aggregate={aggregate} correct={context.correct?.[element.id]} accent={accent} />
          {footer}
        </div>
      );
    }
    case "rating": {
      const { question, max, icon } = element.props;
      return (
        <div className="card" style={cardStyle}>
          <h3>{question}</h3>
          {aggregate?.kind === "numeric" && aggregate.total ? <NumericSummary aggregate={aggregate} max={max} min={1} icon={RATING_ICON[icon]} /> : <div className="rating-row" style={{ color: accent }}>{Array.from({ length: max }, (_, index) => <span key={index}>{icon === "thumb" ? "👍" : RATING_ICON[icon]}</span>)}</div>}
          {footer}
        </div>
      );
    }
    case "slider": {
      const { question, min, max, unit, minLabel, maxLabel, defaultValue } = element.props;
      return (
        <div className="card" style={cardStyle}>
          <h3>{question}</h3>
          {aggregate?.kind === "numeric" && aggregate.total ? <NumericSummary aggregate={aggregate} max={max} min={min} unit={unit} /> : (
            <div className="slider-preview"><span className="numeric-track"><i style={{ left: `${((defaultValue - min) / (max - min || 1)) * 100}%`, background: accent }} /></span></div>
          )}
          <div className="slider-labels"><span>{min}{unit} {minLabel}</span><span>{maxLabel} {max}{unit}</span></div>
          {footer}
        </div>
      );
    }
    case "open_text":
      return <div className="card" style={cardStyle}><h3>{element.props.question}</h3>{aggregate ? <TextWall aggregate={aggregate} /> : <div className="text-placeholder">{element.props.placeholder}</div>}{footer}</div>;
    case "form": {
      const fields = aggregate?.kind === "form" ? aggregate.fields : undefined;
      return (
        <div className="card" style={cardStyle}>
          <h3>{element.props.title}</h3>
          <ul className="form-preview">
            {element.props.fields.map((field) => {
              const summary = fields?.[field.id];
              const detail = !summary ? field.kind.replace("_", " ")
                : summary.kind === "numeric" ? `avg ${summary.average.toFixed(1)}`
                : summary.kind === "choice" ? Object.entries(summary.counts).sort((a, b) => b[1] - a[1]).map(([id, count]) => `${(field.options ?? [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }]).find((option) => option.id === id)?.label ?? id} ${count}`).slice(0, 2).join(" · ")
                : `${summary.total} answers`;
              return <li key={field.id}><span>{field.label}{field.required ? " *" : ""}</span><small>{detail}</small></li>;
            })}
          </ul>
          {footer}
        </div>
      );
    }
    default:
      return null;
  }
}

function TextWall({ aggregate }: { aggregate?: Aggregate }) {
  const items = aggregate?.kind === "text" ? aggregate.recent.slice(0, 12) : [];
  if (!items.length) return <div className="text-placeholder">Answers will appear here</div>;
  return <div className="text-wall">{items.map((item, index) => <span key={index}>{item}</span>)}</div>;
}
