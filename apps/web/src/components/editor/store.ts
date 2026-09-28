"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import type { PresentationDoc, Slide, SlideElement } from "@livo/types";

const HISTORY_LIMIT = 100;

interface History { doc: PresentationDoc; past: PresentationDoc[]; future: PresentationDoc[] }

/**
 * Editor document state with undo/redo. `apply` records one history step, except inside a
 * transaction (drag, resize, typing in a field), which records a single step when it ends.
 */
export function useEditorStore(initial: PresentationDoc) {
  const [history, setHistory] = useState<History>({ doc: initial, past: [], future: [] });
  const transaction = useRef<PresentationDoc | null>(null);
  const latest = useRef(history.doc);
  latest.current = history.doc;

  const apply = useCallback((recipe: (doc: PresentationDoc) => PresentationDoc) => {
    setHistory((current) => {
      const doc = recipe(current.doc);
      if (doc === current.doc) return current;
      if (transaction.current) return { ...current, doc };
      return { doc, past: [...current.past, current.doc].slice(-HISTORY_LIMIT), future: [] };
    });
  }, []);

  // Updaters stay pure (StrictMode runs them twice); the ref is only touched outside them.
  const begin = useCallback(() => { transaction.current ??= latest.current; }, []);

  const end = useCallback(() => {
    const base = transaction.current;
    transaction.current = null;
    if (!base) return;
    setHistory((current) => (base === current.doc ? current : { doc: current.doc, past: [...current.past, base].slice(-HISTORY_LIMIT), future: [] }));
  }, []);

  const undo = useCallback(() => setHistory((current) => current.past.length ? { doc: current.past.at(-1)!, past: current.past.slice(0, -1), future: [current.doc, ...current.future] } : current), []);
  const redo = useCallback(() => setHistory((current) => current.future.length ? { doc: current.future[0], past: [...current.past, current.doc], future: current.future.slice(1) } : current), []);

  return useMemo(() => ({
    doc: history.doc, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    apply, begin, end, undo, redo, inTransaction: () => transaction.current !== null,
  }), [history, apply, begin, end, undo, redo]);
}

export type EditorStore = ReturnType<typeof useEditorStore>;

// --- Pure document helpers -------------------------------------------------------------

export const mapSlide = (doc: PresentationDoc, slideId: string, fn: (slide: Slide) => Slide): PresentationDoc =>
  ({ ...doc, slides: doc.slides.map((slide) => (slide.id === slideId ? fn(slide) : slide)) });

export const mapElements = (doc: PresentationDoc, slideId: string, ids: string[], fn: (element: SlideElement) => SlideElement): PresentationDoc =>
  mapSlide(doc, slideId, (slide) => ({ ...slide, elements: slide.elements.map((element) => (ids.includes(element.id) ? fn(element) : element)) }));

/** Reassigns zIndex to match array order, after sorting by current zIndex. */
export const normaliseZ = (elements: SlideElement[]) => [...elements].sort((a, b) => a.zIndex - b.zIndex).map((element, index) => (element.zIndex === index ? element : { ...element, zIndex: index }));

export function reorderLayers(elements: SlideElement[], ids: string[], direction: "forward" | "backward" | "front" | "back"): SlideElement[] {
  const sorted = normaliseZ(elements);
  const selected = (element: SlideElement) => ids.includes(element.id);
  let order: SlideElement[];
  if (direction === "front") order = [...sorted.filter((e) => !selected(e)), ...sorted.filter(selected)];
  else if (direction === "back") order = [...sorted.filter(selected), ...sorted.filter((e) => !selected(e))];
  else {
    order = [...sorted];
    const step = direction === "forward" ? 1 : -1;
    const indexes = order.map((_, index) => index).filter((index) => selected(order[index]));
    for (const index of direction === "forward" ? indexes.reverse() : indexes) {
      const target = index + step;
      if (target < 0 || target >= order.length || selected(order[target])) continue;
      [order[index], order[target]] = [order[target], order[index]];
    }
  }
  return order.map((element, index) => ({ ...element, zIndex: index }));
}

export type Bounds = { x: number; y: number; width: number; height: number };
export const boundsOf = (elements: Bounds[]): Bounds => {
  const x = Math.min(...elements.map((e) => e.x)), y = Math.min(...elements.map((e) => e.y));
  return { x, y, width: Math.max(...elements.map((e) => e.x + e.width)) - x, height: Math.max(...elements.map((e) => e.y + e.height)) - y };
};

/** Expands a selection so grouped elements are always selected together. */
export function expandGroups(elements: SlideElement[], ids: string[]): string[] {
  const groups = new Set(elements.filter((element) => ids.includes(element.id) && element.groupId).map((element) => element.groupId));
  return elements.filter((element) => ids.includes(element.id) || (element.groupId && groups.has(element.groupId))).map((element) => element.id);
}

/** Copies of elements with fresh ids, offset, and consistently remapped group ids. */
export function cloneElements(elements: SlideElement[], offset: number, zStart: number): SlideElement[] {
  const groups = new Map<string, string>();
  return elements.map((element, index) => ({
    ...structuredClone(element),
    id: crypto.randomUUID(), x: element.x + offset, y: element.y + offset, zIndex: zStart + index,
    groupId: element.groupId ? (groups.get(element.groupId) ?? groups.set(element.groupId, crypto.randomUUID()).get(element.groupId)!) : null,
  }));
}
