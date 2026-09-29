"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type ElementType, type PresentationDoc, type ShapeKind, type Slide, type SlideElement } from "@livo/types";
import { savePresentation } from "@/app/presentation/[id]/actions";
import { startSession } from "@/app/rooms/actions";
import { Logo } from "@/components/brand";
import { savePayload } from "@/lib/doc";
import { exportPptx, exportXlsx } from "@/lib/export";
import { createElement, SLIDE_LAYOUTS } from "@/lib/elements";
import { IMAGE_TYPES_LABEL, isImageType } from "@/lib/image-types";
import { IMAGE_TYPES, uploadImage } from "@/lib/upload";
import { EditorCanvas, type CanvasSettings } from "./canvas";
import { TransactionContext } from "./controls";
import { ArrangeBar, InsertBar, LayersPanel, SlidesPanel, type AlignMode } from "./panels";
import { ElementProperties, SlideProperties, type PropertyActions } from "./properties";
import { boundsOf, cloneElements, expandGroups, mapElements, mapSlide, normaliseZ, reorderLayers, useEditorStore } from "./store";

type SaveState = "saved" | "saving" | "unsaved" | "error";
const SAVE_DELAY = 900;
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** `unsaved` marks a document that differs from the database on load (e.g. a new deck's starter slide). */
export function Editor({ initialDoc, unsaved = false }: { initialDoc: PresentationDoc; unsaved?: boolean }) {
  const store = useEditorStore(initialDoc);
  const { doc, apply } = store;
  const [slideId, setSlideId] = useState(initialDoc.slides[0]?.id ?? "");
  const [selection, setSelectionRaw] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"properties" | "layers">("properties");
  const [settings, setSettings] = useState<CanvasSettings>({ snap: true, grid: false, gridSize: 20 });
  const [toast, setToast] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [presenting, startPresenting] = useTransition();
  const [exporting, setExporting] = useState<"pptx" | "xlsx" | null>(null);
  const clipboard = useRef<SlideElement[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const slide = doc.slides.find((item) => item.id === slideId) ?? doc.slides[0];
  const slideIndex = doc.slides.indexOf(slide);
  const selected = useMemo(() => slide?.elements.filter((element) => selection.includes(element.id)) ?? [], [slide, selection]);
  const setSelection = useCallback((ids: string[]) => setSelectionRaw(ids), []);
  const notify = useCallback((message: string) => { setToast(message); setTimeout(() => setToast((current) => (current === message ? null : current)), 4000); }, []);

  // Keep the selection valid when undo/redo removes elements or slides.
  useEffect(() => {
    if (!doc.slides.some((item) => item.id === slideId) && doc.slides[0]) setSlideId(doc.slides[0].id);
    setSelectionRaw((current) => { const next = current.filter((id) => slide?.elements.some((element) => element.id === id)); return next.length === current.length ? current : next; });
  }, [doc, slideId, slide]);

  // --- Autosave: debounce, skip mid-gesture, serialise requests ---------------------------
  const latestDoc = useRef(doc);
  latestDoc.current = doc;
  const savedDoc = useRef<PresentationDoc | null>(unsaved ? null : initialDoc);
  const inFlight = useRef<Promise<void> | null>(null);

  const saveNow = useCallback(async (): Promise<boolean> => {
    while (inFlight.current) await inFlight.current;
    const current = latestDoc.current;
    if (current === savedDoc.current) return true;
    setSaveState("saving");
    let ok = false;
    inFlight.current = savePresentation(current.id, current.title, savePayload(current))
      .then((result) => {
        ok = result.ok;
        if (result.ok) { savedDoc.current = current; setSaveState(latestDoc.current === current ? "saved" : "unsaved"); }
        else { setSaveState("error"); notify(result.error); }
      })
      .catch(() => { setSaveState("error"); notify("Couldn't save. Check your connection — we'll retry on the next change."); })
      .finally(() => { inFlight.current = null; });
    await inFlight.current;
    return ok;
  }, [notify]);

  useEffect(() => {
    if (doc === savedDoc.current) return;
    setSaveState("unsaved");
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { if (store.inTransaction()) timer = setTimeout(tick, 400); else void saveNow(); };
    timer = setTimeout(tick, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [doc, saveNow, store]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (latestDoc.current !== savedDoc.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // --- Element operations -------------------------------------------------------------------
  const updateElements = useCallback((ids: string[], fn: (element: SlideElement) => SlideElement) => apply((current) => mapElements(current, slide.id, ids, fn)), [apply, slide?.id]);
  const updateSlide = useCallback((fn: (slide: Slide) => Slide) => apply((current) => mapSlide(current, slide.id, fn)), [apply, slide?.id]);

  const insert = useCallback((elements: SlideElement[]) => {
    const top = Math.max(-1, ...slide.elements.map((element) => element.zIndex));
    const placed = elements.map((element, index) => ({ ...element, zIndex: top + 1 + index }));
    updateSlide((current) => ({ ...current, elements: [...current.elements, ...placed] }));
    setSelection(placed.map((element) => element.id));
    setTab("properties");
  }, [slide, updateSlide, setSelection]);

  const insertType = (type: ElementType, shape?: ShapeKind) => insert([createElement(type, { shape })]);

  const insertImageFile = useCallback(async (file: File) => {
    if (!isImageType(file.type)) return notify(`Use a ${IMAGE_TYPES_LABEL} image.`);
    notify("Uploading image…");
    try {
      const src = await uploadImage(doc.id, file);
      const size = await new Promise<{ width: number; height: number }>((resolve) => { const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = () => resolve({ width: 480, height: 320 }); image.src = src; });
      const scale = Math.min(1, 640 / size.width, 480 / size.height);
      insert([createElement("image", { props: { src, alt: file.name.replace(/\.[^.]+$/, "") }, box: { width: Math.round(size.width * scale), height: Math.round(size.height * scale) } })]);
      setToast(null);
    } catch (error) { notify((error as Error).message); }
  }, [doc.id, insert, notify]);

  const removeSelected = useCallback(() => {
    const removable = selected.filter((element) => !element.locked).map((element) => element.id);
    if (!removable.length) return;
    updateSlide((current) => ({ ...current, elements: normaliseZ(current.elements.filter((element) => !removable.includes(element.id))) }));
    setSelection([]);
  }, [selected, updateSlide, setSelection]);

  const duplicateSelected = useCallback(() => {
    if (selected.length) insert(cloneElements(selected, 20, 0));
  }, [selected, insert]);

  const nudge = useCallback((dx: number, dy: number) => {
    const ids = selected.filter((element) => !element.locked).map((element) => element.id);
    if (ids.length) updateElements(ids, (element) => ({ ...element, x: element.x + dx, y: element.y + dy }));
  }, [selected, updateElements]);

  const align = (mode: AlignMode) => {
    const targets = selected.filter((element) => !element.locked);
    if (!targets.length) return;
    const box = targets.length > 1 ? boundsOf(targets) : { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    updateElements(targets.map((element) => element.id), (element) => {
      switch (mode) {
        case "left": return { ...element, x: box.x };
        case "center": return { ...element, x: Math.round(box.x + (box.width - element.width) / 2) };
        case "right": return { ...element, x: box.x + box.width - element.width };
        case "top": return { ...element, y: box.y };
        case "middle": return { ...element, y: Math.round(box.y + (box.height - element.height) / 2) };
        case "bottom": return { ...element, y: box.y + box.height - element.height };
      }
    });
  };

  const distribute = (axis: "x" | "y") => {
    const size = axis === "x" ? "width" : "height";
    const targets = [...selected].sort((a, b) => a[axis] - b[axis]);
    if (targets.length < 3) return;
    const box = boundsOf(targets);
    const gap = (box[size] - targets.reduce((total, element) => total + element[size], 0)) / (targets.length - 1);
    const positions = new Map<string, number>();
    targets.reduce((cursor, element) => { positions.set(element.id, Math.round(cursor)); return cursor + element[size] + gap; }, box[axis]);
    updateElements([...positions.keys()], (element) => ({ ...element, [axis]: positions.get(element.id)! }));
  };

  const layer = useCallback((direction: "forward" | "backward" | "front" | "back", ids = selection) => updateSlide((current) => ({ ...current, elements: reorderLayers(current.elements, ids, direction) })), [selection, updateSlide]);
  const group = useCallback(() => { if (selected.length > 1) { const groupId = crypto.randomUUID(); updateElements(selection, (element) => ({ ...element, groupId })); } }, [selected, selection, updateElements]);
  const ungroup = useCallback(() => updateElements(selection, (element) => ({ ...element, groupId: null })), [selection, updateElements]);
  const toggleLock = useCallback(() => { const locked = !selected.every((element) => element.locked); updateElements(selection, (element) => ({ ...element, locked })); }, [selected, selection, updateElements]);

  // --- Slide operations ----------------------------------------------------------------------
  const addSlide = (layoutId: string) => {
    const created = (SLIDE_LAYOUTS.find((layout) => layout.id === layoutId) ?? SLIDE_LAYOUTS[0]).build();
    apply((current) => { const slides = [...current.slides]; slides.splice(slideIndex + 1, 0, created); return { ...current, slides }; });
    setSlideId(created.id);
    setSelection([]);
  };
  const duplicateSlide = (id: string) => {
    const source = doc.slides.find((item) => item.id === id)!;
    const copy: Slide = { ...structuredClone(source), id: crypto.randomUUID(), title: `${source.title} (copy)`, elements: cloneElements(source.elements, 0, 0).map((element, index) => ({ ...element, zIndex: source.elements[index].zIndex })) };
    apply((current) => { const slides = [...current.slides]; slides.splice(current.slides.findIndex((item) => item.id === id) + 1, 0, copy); return { ...current, slides }; });
    setSlideId(copy.id);
  };
  const deleteSlide = (id: string) => {
    if (doc.slides.length <= 1) return;
    const index = doc.slides.findIndex((item) => item.id === id);
    apply((current) => ({ ...current, slides: current.slides.filter((item) => item.id !== id) }));
    if (id === slideId) setSlideId(doc.slides[index + 1]?.id ?? doc.slides[index - 1].id);
  };
  const moveSlide = (from: number, to: number) => apply((current) => { const slides = [...current.slides]; const [moved] = slides.splice(from, 1); slides.splice(to, 0, moved); return { ...current, slides }; });

  // --- Keyboard shortcuts, clipboard, paste/drop images -----------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "s") { event.preventDefault(); void saveNow(); return; }
      if (isTyping(event.target)) return;
      if (mod && key === "z") { event.preventDefault(); if (event.shiftKey) store.redo(); else store.undo(); return; }
      if (mod && key === "y") { event.preventDefault(); store.redo(); return; }
      if (mod && key === "a") { event.preventDefault(); setSelection(slide.elements.map((element) => element.id)); return; }
      if (mod && key === "c" && selected.length) { clipboard.current = structuredClone(selected); return; }
      if (mod && key === "x" && selected.length) { clipboard.current = structuredClone(selected); removeSelected(); return; }
      if (mod && key === "v" && clipboard.current.length) { event.preventDefault(); insert(cloneElements(clipboard.current, 20, 0)); clipboard.current = clipboard.current.map((element) => ({ ...element, x: element.x + 20, y: element.y + 20 })); return; }
      if (mod && key === "d") { event.preventDefault(); duplicateSelected(); return; }
      if (mod && key === "g") { event.preventDefault(); if (event.shiftKey) ungroup(); else group(); return; }
      if (mod && event.shiftKey && key === "l") { event.preventDefault(); toggleLock(); return; }
      if (mod && (event.key === "]" || event.key === "}")) { event.preventDefault(); layer(event.shiftKey ? "front" : "forward"); return; }
      if (mod && (event.key === "[" || event.key === "{")) { event.preventDefault(); layer(event.shiftKey ? "back" : "backward"); return; }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removeSelected(); return; }
      if (event.key === "Escape") { setSelection([]); return; }
      if (event.key === "Enter" && selected.length === 1 && selected[0].type === "text") { event.preventDefault(); setEditingId(selected[0].id); return; }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[event.key] && selected.length) { event.preventDefault(); const step = event.shiftKey ? 10 : 1; nudge(arrows[event.key][0] * step, arrows[event.key][1] * step); return; }
      if (!selected.length && (event.key === "PageDown" || event.key === "PageUp")) { const next = doc.slides[slideIndex + (event.key === "PageDown" ? 1 : -1)]; if (next) setSlideId(next.id); }
    };
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;
      const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/"));
      if (file) { event.preventDefault(); void insertImageFile(file); }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("paste", onPaste); };
  }, [doc.slides, slide, slideIndex, selected, store, saveNow, insert, insertImageFile, removeSelected, duplicateSelected, group, ungroup, toggleLock, layer, nudge, setSelection]);

  const present = () => startPresenting(async () => {
    if (!(await saveNow())) return;
    const result = await startSession(doc.id);
    if (result?.error) notify(result.error);
  });

  const exportAs = async (format: "pptx" | "xlsx") => {
    setExporting(format);
    try {
      if (format === "pptx") {
        const { skippedImages } = await exportPptx(doc);
        if (skippedImages) notify(`Exported. ${skippedImages} image${skippedImages === 1 ? "" : "s"} couldn't be downloaded and ${skippedImages === 1 ? "was" : "were"} left out.`);
      } else await exportXlsx(doc);
    } catch (error) {
      console.error(error);
      notify("Export failed. Try again.");
    } finally {
      setExporting(null);
    }
  };

  const actions: PropertyActions = { presentationId: doc.id, update: updateElements, updateSlide, notify };
  if (!slide) return null;

  return (
    <TransactionContext.Provider value={{ begin: store.begin, end: store.end }}>
      <div className="editor">
        <header className="editor-top">
          <Logo href="/dashboard" withName={false} />
          <input className="doc-title" aria-label="Presentation title" value={doc.title} maxLength={120} onFocus={store.begin} onBlur={store.end} onChange={(event) => apply((current) => ({ ...current, title: event.target.value }))} />
          <span className={`save-state is-${saveState}`}>{{ saved: "All changes saved", saving: "Saving…", unsaved: "Unsaved changes", error: "Save failed — retrying on next edit" }[saveState]}</span>
          <div className="editor-top-actions">
            <button type="button" className="tool icon" title="Undo (Ctrl+Z)" disabled={!store.canUndo} onClick={store.undo}>↶</button>
            <button type="button" className="tool icon" title="Redo (Ctrl+Shift+Z)" disabled={!store.canRedo} onClick={store.redo}>↷</button>
            <label className="tool check" title="Snap to guides and grid"><input type="checkbox" checked={settings.snap} onChange={(event) => setSettings({ ...settings, snap: event.target.checked })} /> Snap</label>
            <label className="tool check" title="Show grid"><input type="checkbox" checked={settings.grid} onChange={(event) => setSettings({ ...settings, grid: event.target.checked })} /> Grid</label>
            <details className="export-menu" onToggle={(event) => { const menu = event.currentTarget; if (menu.open) setTimeout(() => document.addEventListener("click", () => { menu.open = false; }, { once: true })); }}>
              <summary className="tool" aria-disabled={exporting !== null}>{exporting ? "Exporting…" : "Export ▾"}</summary>
              <div className="export-options" role="menu">
                <button type="button" role="menuitem" disabled={exporting !== null} onClick={() => void exportAs("pptx")}><b>PowerPoint</b><small>.pptx · slides and speaker notes</small></button>
                <button type="button" role="menuitem" disabled={exporting !== null} onClick={() => void exportAs("xlsx")}><b>Excel</b><small>.xlsx · slide text, questions and answer key</small></button>
              </div>
            </details>
            <Link href={`/presentation/${doc.id}/analytics`} className="tool">Analytics</Link>
            <button type="button" className="button-primary" onClick={present} disabled={presenting}>{presenting ? "Starting…" : "▶ Present"}</button>
          </div>
        </header>

        <SlidesPanel slides={doc.slides} currentId={slide.id} onSelect={(id) => { setSlideId(id); setSelection([]); setEditingId(null); }} onAdd={addSlide} onDuplicate={duplicateSlide} onDelete={deleteSlide} onMove={moveSlide} />

        <main className="editor-main"
          onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
          onDrop={(event) => { const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/")); if (file) { event.preventDefault(); void insertImageFile(file); } }}>
          <InsertBar onInsert={insertType} onImage={() => fileInput.current?.click()} />
          <input ref={fileInput} type="file" hidden accept={IMAGE_TYPES.join(",")} onChange={(event) => { const file = event.target.files?.[0]; if (file) void insertImageFile(file); event.target.value = ""; }} />
          {selected.length > 0 && <ArrangeBar count={selected.length} grouped={selected.some((element) => element.groupId)} locked={selected.every((element) => element.locked)}
            onAlign={align} onDistribute={distribute} onLayer={(direction) => layer(direction)} onGroup={group} onUngroup={ungroup} onLock={toggleLock} onDuplicate={duplicateSelected} onDelete={removeSelected} />}
          <EditorCanvas slide={slide} store={store} selection={selection} setSelection={setSelection} settings={settings} editingId={editingId} setEditingId={setEditingId} />
          <footer className="editor-status">Slide {slideIndex + 1} of {doc.slides.length} · <kbd>Del</kbd> delete · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate · <kbd>Ctrl</kbd>+<kbd>G</kbd> group · hold <kbd>Alt</kbd> to move without snapping</footer>
        </main>

        <aside className="editor-side">
          <div className="side-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "properties"} className={tab === "properties" ? "is-active" : ""} onClick={() => setTab("properties")}>Properties</button>
            <button type="button" role="tab" aria-selected={tab === "layers"} className={tab === "layers" ? "is-active" : ""} onClick={() => setTab("layers")}>Layers</button>
          </div>
          <div className="side-body">
            {tab === "layers"
              ? <LayersPanel elements={slide.elements} selection={selection}
                  onSelect={(id, additive) => setSelection(additive ? [...new Set([...selection, id])] : expandGroups(slide.elements, [id]))}
                  onRename={(id, name) => updateElements([id], (element) => ({ ...element, name: name || undefined }))}
                  onToggleLock={(id) => updateElements([id], (element) => ({ ...element, locked: !element.locked }))}
                  onMove={(id, direction) => layer(direction, [id])} />
              : selected.length ? <ElementProperties key={selection.join()} elements={selected} actions={actions} /> : <SlideProperties key={slide.id} slide={slide} actions={actions} />}
          </div>
        </aside>
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </TransactionContext.Provider>
  );
}
