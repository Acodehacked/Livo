"use client";
import { useState, type ReactNode } from "react";
import { slideInteractions, type ElementType, type ShapeKind, type Slide, type SlideElement } from "@livo/types";
import { SlideThumb } from "@/components/slide/render";
import { ELEMENT_LABELS, SLIDE_LAYOUTS } from "@/lib/elements";
import { plainText } from "@/lib/sanitize";
import { SHAPES } from "./properties";

export function Menu({ label, children, className = "", title }: { label: ReactNode; children: (close: () => void) => ReactNode; className?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`menu ${className}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button type="button" className="tool" title={title} aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>
      {open && <div className="menu-popover" role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}

// --- Slides ------------------------------------------------------------------------------

export function SlidesPanel({ slides, currentId, onSelect, onAdd, onDuplicate, onDelete, onMove }: {
  slides: Slide[]; currentId: string; onSelect: (id: string) => void; onAdd: (layout: string) => void;
  onDuplicate: (id: string) => void; onDelete: (id: string) => void; onMove: (from: number, to: number) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return (
    <aside className="slides-panel" aria-label="Slides">
      <ol>
        {slides.map((slide, index) => (
          <li key={slide.id} className={`${slide.id === currentId ? "is-current" : ""}${over === index && dragging !== null && dragging !== index ? " is-drop" : ""}`}
            draggable onDragStart={(event) => { setDragging(index); event.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(event) => { event.preventDefault(); setOver(index); }} onDragEnd={() => { setDragging(null); setOver(null); }}
            onDrop={(event) => { event.preventDefault(); if (dragging !== null && dragging !== index) onMove(dragging, index); setDragging(null); setOver(null); }}>
            <span className="slide-number">{index + 1}</span>
            <button type="button" className="slide-thumb-button" onClick={() => onSelect(slide.id)} aria-label={`Slide ${index + 1}: ${slide.title}`}>
              <SlideThumb slide={slide} />
              {slideInteractions(slide).length > 0 && <span className="slide-badge" title="Interactive slide">●</span>}
            </button>
            <div className="slide-actions">
              <button type="button" title="Duplicate slide" onClick={() => onDuplicate(slide.id)}>⧉</button>
              <button type="button" title="Delete slide" disabled={slides.length <= 1} onClick={() => onDelete(slide.id)}>✕</button>
            </div>
          </li>
        ))}
      </ol>
      <Menu label="+ Add slide" className="add-slide" title="Add slide">
        {(close) => SLIDE_LAYOUTS.map((layout) => <button key={layout.id} type="button" role="menuitem" onClick={() => { onAdd(layout.id); close(); }}>{layout.label}</button>)}
      </Menu>
    </aside>
  );
}

// --- Layers ---------------------------------------------------------------------------------

const elementName = (element: SlideElement) => {
  if (element.name) return element.name;
  const p = element.props as unknown as Record<string, unknown>;
  const text = element.type === "text" ? plainText(String(p.html)) : String(p.question ?? p.title ?? p.label ?? p.text ?? "");
  return text ? text.slice(0, 32) : ELEMENT_LABELS[element.type];
};

export function LayersPanel({ elements, selection, onSelect, onRename, onToggleLock, onMove }: {
  elements: SlideElement[]; selection: string[]; onSelect: (id: string, additive: boolean) => void;
  onRename: (id: string, name: string) => void; onToggleLock: (id: string) => void; onMove: (id: string, direction: "forward" | "backward") => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const layers = [...elements].sort((a, b) => b.zIndex - a.zIndex);
  if (!layers.length) return <p className="hint panel-empty">This slide is empty. Insert something from the toolbar.</p>;
  return (
    <ul className="layers">
      {layers.map((element, index) => (
        <li key={element.id} className={selection.includes(element.id) ? "is-selected" : ""} onClick={(event) => onSelect(element.id, event.shiftKey)}>
          <span className="layer-type">{ELEMENT_LABELS[element.type]}</span>
          {renaming === element.id
            ? <input autoFocus defaultValue={elementName(element)} onClick={(event) => event.stopPropagation()} onBlur={(event) => { onRename(element.id, event.target.value.trim()); setRenaming(null); }} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); if (event.key === "Escape") setRenaming(null); }} />
            : <span className="layer-name" onDoubleClick={() => setRenaming(element.id)} title="Double-click to rename">{elementName(element)}</span>}
          {element.groupId && <span className="layer-group" title="Grouped">⧉</span>}
          <span className="layer-actions" onClick={(event) => event.stopPropagation()}>
            <button type="button" title="Bring forward" disabled={index === 0} onClick={() => onMove(element.id, "forward")}>↑</button>
            <button type="button" title="Send backward" disabled={index === layers.length - 1} onClick={() => onMove(element.id, "backward")}>↓</button>
            <button type="button" title={element.locked ? "Unlock" : "Lock"} className={element.locked ? "is-on" : ""} onClick={() => onToggleLock(element.id)}>{element.locked ? "🔒" : "🔓"}</button>
          </span>
        </li>
      ))}
    </ul>
  );
}

// --- Toolbars ---------------------------------------------------------------------------------

const INTERACTIVE: ElementType[] = ["quiz", "poll", "rating", "slider", "open_text", "form"];

export function InsertBar({ onInsert, onImage }: { onInsert: (type: ElementType, shape?: ShapeKind) => void; onImage: () => void }) {
  return (
    <div className="insert-bar" role="toolbar" aria-label="Insert">
      <button type="button" className="tool" onClick={() => onInsert("text")} title="Text (T)"><b>T</b> Text</button>
      <button type="button" className="tool" onClick={onImage} title="Image">▣ Image</button>
      <Menu label="◆ Shape" title="Shape">{(close) => <div className="shape-menu">{SHAPES.map(([shape, label]) => <button key={shape} type="button" role="menuitem" onClick={() => { onInsert("shape", shape); close(); }}>{label}</button>)}</div>}</Menu>
      <button type="button" className="tool" onClick={() => onInsert("icon")} title="Icon">☺ Icon</button>
      <button type="button" className="tool" onClick={() => onInsert("link")} title="Link">🔗 Link</button>
      <button type="button" className="tool" onClick={() => onInsert("button")} title="Button">▭ Button</button>
      <span className="toolbar-divider" />
      <Menu label={<span className="tool-accent">⚡ Interactive</span>} title="Interactive elements">
        {(close) => INTERACTIVE.map((type) => <button key={type} type="button" role="menuitem" onClick={() => { onInsert(type); close(); }}>{ELEMENT_LABELS[type]}</button>)}
      </Menu>
    </div>
  );
}

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

export function ArrangeBar({ count, grouped, locked, onAlign, onDistribute, onLayer, onGroup, onUngroup, onLock, onDuplicate, onDelete }: {
  count: number; grouped: boolean; locked: boolean;
  onAlign: (mode: AlignMode) => void; onDistribute: (axis: "x" | "y") => void; onLayer: (direction: "forward" | "backward" | "front" | "back") => void;
  onGroup: () => void; onUngroup: () => void; onLock: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const align: [AlignMode, string, string][] = [["left", "⇤", "Align left"], ["center", "⇹", "Align centre"], ["right", "⇥", "Align right"], ["top", "⤒", "Align top"], ["middle", "⇕", "Align middle"], ["bottom", "⤓", "Align bottom"]];
  return (
    <div className="arrange-bar" role="toolbar" aria-label="Arrange">
      <span className="arrange-label">{count > 1 ? `${count} selected` : "Align to slide"}</span>
      {align.map(([mode, icon, title]) => <button key={mode} type="button" className="tool icon" title={title} onClick={() => onAlign(mode)}>{icon}</button>)}
      {count > 2 && <>
        <button type="button" className="tool icon" title="Distribute horizontally" onClick={() => onDistribute("x")}>⋯</button>
        <button type="button" className="tool icon" title="Distribute vertically" onClick={() => onDistribute("y")}>⋮</button>
      </>}
      <span className="toolbar-divider" />
      <Menu label="Order" title="Layer order">
        {(close) => ([["front", "Bring to front", "Ctrl+Shift+]"], ["forward", "Bring forward", "Ctrl+]"], ["backward", "Send backward", "Ctrl+["], ["back", "Send to back", "Ctrl+Shift+["]] as const).map(([direction, label, keys]) => (
          <button key={direction} type="button" role="menuitem" onClick={() => { onLayer(direction); close(); }}>{label}<kbd>{keys}</kbd></button>
        ))}
      </Menu>
      {count > 1 && !grouped && <button type="button" className="tool" onClick={onGroup} title="Group (Ctrl+G)">Group</button>}
      {grouped && <button type="button" className="tool" onClick={onUngroup} title="Ungroup (Ctrl+Shift+G)">Ungroup</button>}
      <button type="button" className={`tool${locked ? " is-active" : ""}`} onClick={onLock} title="Lock (Ctrl+Shift+L)">{locked ? "Unlock" : "Lock"}</button>
      <button type="button" className="tool" onClick={onDuplicate} title="Duplicate (Ctrl+D)">Duplicate</button>
      <button type="button" className="tool danger" onClick={onDelete} title="Delete (Del)">Delete</button>
    </div>
  );
}
