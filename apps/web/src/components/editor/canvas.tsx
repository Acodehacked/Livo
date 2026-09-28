"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type ElementOf, type Slide, type SlideElement } from "@livo/types";
import { boxStyle, ElementBody, SlideBackdrop, Stage } from "@/components/slide/render";
import { sanitizeHtml } from "@/lib/sanitize";
import { boundsOf, expandGroups, mapElements, type Bounds, type EditorStore } from "./store";

export interface CanvasSettings { snap: boolean; grid: boolean; gridSize: number }
type Guide = { axis: "x" | "y"; at: number };
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const SNAP_PX = 6;

/** Snaps a moving box to canvas edges/centre and other elements' edges/centres (smart guides), else to the grid. */
function snapBox(box: Bounds, others: Bounds[], threshold: number, settings: CanvasSettings) {
  const guides: Guide[] = [];
  const axis = (start: number, size: number, targets: number[], name: "x" | "y") => {
    const edges = [start, start + size / 2, start + size];
    let best: { delta: number; at: number } | null = null;
    for (const target of targets) for (const edge of edges) {
      const delta = target - edge;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: target };
    }
    if (best) { guides.push({ axis: name, at: best.at }); return start + best.delta; }
    return settings.grid ? Math.round(start / settings.gridSize) * settings.gridSize : start;
  };
  if (!settings.snap) return { x: box.x, y: box.y, guides };
  const xs = [0, CANVAS_WIDTH / 2, CANVAS_WIDTH, ...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width])];
  const ys = [0, CANVAS_HEIGHT / 2, CANVAS_HEIGHT, ...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height])];
  return { x: axis(box.x, box.width, xs, "x"), y: axis(box.y, box.height, ys, "y"), guides };
}

export function EditorCanvas({ slide, store, selection, setSelection, settings, editingId, setEditingId }: {
  slide: Slide; store: EditorStore; selection: string[]; setSelection: (ids: string[]) => void;
  settings: CanvasSettings; editingId: string | null; setEditingId: (id: string | null) => void;
}) {
  const [scale, setScale] = useState(1);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const onScale = useCallback((value: number) => setScale(value || 1), []);

  const toLogical = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };

  /** Pointer drag helper: calls onMove with the logical delta, wraps the gesture in one history step. */
  const drag = (event: ReactPointerEvent, onMove: (delta: { x: number; y: number }, raw: PointerEvent) => void, onEnd?: (moved: boolean) => void) => {
    event.preventDefault();
    event.stopPropagation();
    const start = toLogical(event);
    let moved = false;
    const move = (raw: PointerEvent) => {
      const point = toLogical(raw);
      const delta = { x: point.x - start.x, y: point.y - start.y };
      if (!moved && Math.hypot(delta.x, delta.y) * scale < 3) return;
      if (!moved) { moved = true; store.begin(); }
      onMove(delta, raw);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGuides([]);
      if (moved) store.end();
      onEnd?.(moved);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onElementPointerDown = (event: ReactPointerEvent, element: SlideElement) => {
    if (event.button !== 0 || editingId === element.id) return;
    const groupIds = expandGroups(slide.elements, [element.id]);
    const already = selection.includes(element.id);
    const next = event.shiftKey ? (already ? selection.filter((id) => !groupIds.includes(id)) : [...selection, ...groupIds]) : already ? selection : groupIds;
    setSelection(next);
    if (editingId) setEditingId(null);
    const movable = slide.elements.filter((item) => next.includes(item.id) && !item.locked);
    if (!movable.length) { event.stopPropagation(); return; }
    const origin = new Map(movable.map((item) => [item.id, { x: item.x, y: item.y }]));
    const box = boundsOf(movable);
    const others = slide.elements.filter((item) => !next.includes(item.id));
    drag(event, (delta, raw) => {
      const snapped = raw.altKey ? { x: box.x + delta.x, y: box.y + delta.y, guides: [] } : snapBox({ ...box, x: box.x + delta.x, y: box.y + delta.y }, others, SNAP_PX / scale, settings);
      setGuides(snapped.guides);
      const dx = Math.round(snapped.x - box.x), dy = Math.round(snapped.y - box.y);
      store.apply((doc) => mapElements(doc, slide.id, [...origin.keys()], (item) => ({ ...item, x: origin.get(item.id)!.x + dx, y: origin.get(item.id)!.y + dy })));
    });
  };

  const onResize = (event: ReactPointerEvent, element: SlideElement, handle: Handle) => {
    const start = { x: element.x, y: element.y, width: element.width, height: element.height };
    const radians = (element.rotation * Math.PI) / 180;
    const ratio = start.width / start.height;
    drag(event, (delta, raw) => {
      // Project the pointer delta into the element's rotated frame.
      const local = { x: delta.x * Math.cos(radians) + delta.y * Math.sin(radians), y: -delta.x * Math.sin(radians) + delta.y * Math.cos(radians) };
      let { x, y, width, height } = start;
      if (handle.includes("e")) width = start.width + local.x;
      if (handle.includes("w")) width = start.width - local.x;
      if (handle.includes("s")) height = start.height + local.y;
      if (handle.includes("n")) height = start.height - local.y;
      const keepRatio = raw.shiftKey || (element.type === "image" && handle.length === 2) || element.type === "icon";
      if (keepRatio) { if (handle === "n" || handle === "s") width = height * ratio; else height = width / ratio; }
      width = Math.max(12, Math.round(width)); height = Math.max(element.type === "shape" && element.props.shape === "line" ? 2 : 12, Math.round(height));
      if (handle.includes("w")) x = start.x + start.width - width;
      if (handle.includes("n")) y = start.y + start.height - height;
      if (settings.snap && settings.grid && !raw.altKey && !element.rotation) {
        const g = settings.gridSize;
        if (handle.includes("e")) width = Math.max(g, Math.round((x + width) / g) * g - x);
        if (handle.includes("s")) height = Math.max(g, Math.round((y + height) / g) * g - y);
      }
      store.apply((doc) => mapElements(doc, slide.id, [element.id], (item) => ({ ...item, x: Math.round(x), y: Math.round(y), width, height })));
    });
  };

  const onRotate = (event: ReactPointerEvent, element: SlideElement) => {
    const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
    const startPoint = toLogical(event);
    drag(event, (delta, raw) => {
      const point = { x: startPoint.x + delta.x, y: startPoint.y + delta.y };
      let angle = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90;
      angle = ((angle % 360) + 360) % 360;
      if (raw.shiftKey) angle = Math.round(angle / 15) * 15;
      else for (const snap of [0, 90, 180, 270, 360]) if (Math.abs(angle - snap) < 3) angle = snap;
      store.apply((doc) => mapElements(doc, slide.id, [element.id], (item) => ({ ...item, rotation: Math.round(angle) % 360 })));
    });
  };

  const onBackgroundPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    setEditingId(null);
    const start = toLogical(event);
    const base = event.shiftKey ? selection : [];
    if (!event.shiftKey) setSelection([]);
    event.preventDefault();
    const move = (raw: PointerEvent) => {
      const point = toLogical(raw);
      const box = { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) };
      setMarquee(box);
      const hit = slide.elements.filter((item) => item.x < box.x + box.width && item.x + item.width > box.x && item.y < box.y + box.height && item.y + item.height > box.y).map((item) => item.id);
      setSelection(expandGroups(slide.elements, [...new Set([...base, ...hit])]));
    };
    const up = () => { setMarquee(null); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const selected = slide.elements.filter((item) => selection.includes(item.id));
  const handleSize = 10 / scale;
  const elements = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="editor-stage-wrap">
      <Stage fit="contain" onScale={onScale} className="editor-stage">
        <div ref={canvasRef} className="slide editor-slide" onPointerDown={onBackgroundPointerDown}>
          <SlideBackdrop slide={slide} />
          {settings.grid && <div className="editor-grid" style={{ backgroundSize: `${settings.gridSize}px ${settings.gridSize}px` }} />}
          {elements.map((element) => (
            <div key={element.id} data-id={element.id} className={`editor-el${element.locked ? " is-locked" : ""}`} style={boxStyle(element)}
              onPointerDown={(event) => onElementPointerDown(event, element)}
              onDoubleClick={() => { if (element.type === "text" && !element.locked) { setSelection([element.id]); setEditingId(element.id); } }}>
              {editingId === element.id && element.type === "text" ? <TextEditor element={element} store={store} slideId={slide.id} onDone={() => setEditingId(null)} /> : <ElementBody element={element} />}
            </div>
          ))}
          {selected.map((element) => (
            <div key={element.id} className={`selection-box${selected.length > 1 ? " is-multi" : ""}`} style={{ ...boxStyle(element), zIndex: 10_000, opacity: 1, outlineWidth: 2 / scale }}>
              {selected.length === 1 && !element.locked && editingId !== element.id && <>
                {HANDLES.map((handle) => <span key={handle} className={`handle handle-${handle}`} style={{ width: handleSize, height: handleSize, borderWidth: 1.5 / scale }} onPointerDown={(event) => onResize(event, element, handle)} />)}
                <span className="rotate-handle" style={{ width: handleSize * 1.3, height: handleSize * 1.3, top: -28 / scale, borderWidth: 1.5 / scale }} onPointerDown={(event) => onRotate(event, element)} />
              </>}
            </div>
          ))}
          {guides.map((guide, index) => <div key={index} className={`guide guide-${guide.axis}`} style={guide.axis === "x" ? { left: guide.at, width: 1 / scale } : { top: guide.at, height: 1 / scale }} />)}
          {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height, borderWidth: 1 / scale }} />}
        </div>
      </Stage>
    </div>
  );
}

/** In-place rich text editing. Formatting commands come from the toolbar via document.execCommand. */
function TextEditor({ element, store, slideId, onDone }: { element: ElementOf<"text">; store: EditorStore; slideId: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { fontSize, fontFamily, color, align, lineHeight, valign } = element.props;
  useEffect(() => {
    const node = ref.current!;
    node.innerHTML = sanitizeHtml(element.props.html);
    node.focus();
    store.begin(); // the whole editing session is one undo step
    const range = document.createRange();
    range.selectNodeContents(node);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    return () => store.end();
    // Only on mount: re-applying html while typing would move the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const commit = () => {
    const html = sanitizeHtml(ref.current?.innerHTML ?? "");
    if (html !== element.props.html) store.apply((doc) => mapElements(doc, slideId, [element.id], (item) => ({ ...item, props: { ...(item as ElementOf<"text">).props, html } }) as SlideElement));
  };
  return (
    <div className="el-text is-editing" style={{ fontSize, fontFamily, color, textAlign: align, lineHeight, justifyContent: valign === "middle" ? "center" : valign === "bottom" ? "flex-end" : "flex-start" }}>
      <div ref={ref} contentEditable suppressContentEditableWarning className="text-editable" data-text-editor
        onBlur={(event) => { if ((event.relatedTarget as HTMLElement | null)?.closest("[data-keep-editing]")) return; commit(); onDone(); }}
        onInput={commit}
        onKeyDown={(event) => { if (event.key === "Escape") { commit(); onDone(); } event.stopPropagation(); }}
        onPointerDown={(event) => event.stopPropagation()} />
    </div>
  );
}
