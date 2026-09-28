import { interactionOf, interactionTitle, slideType, type PresentationDoc, type Slide, type SlideBackground, type SlideElement } from "@livo/types";

// Mapping between the normalized Supabase rows and the editor's PresentationDoc.

type ElementRow = { id: string; type: string; x: number | string; y: number | string; width: number | string; height: number | string; rotation: number | string; z_index: number; properties: Record<string, unknown> | null };
type SlideRow = { id: string; order_index: number; title: string; notes?: string | null; background: Partial<SlideBackground> | null; slide_elements?: ElementRow[] | null };
export type PresentationRow = { id: string; title: string; slides?: SlideRow[] | null };

export const PRESENTATION_SELECT = "id, title, slides(id, order_index, title, notes, background, slide_elements(id, type, x, y, width, height, rotation, z_index, properties))";

export const defaultBackground = (): SlideBackground => ({ fill: { type: "solid", color: "#ffffff" }, image: null });

export function elementFromRow(row: ElementRow): SlideElement {
  const { props, style, name, groupId, locked } = (row.properties ?? {}) as { props?: unknown; style?: SlideElement["style"]; name?: string; groupId?: string | null; locked?: boolean };
  return {
    id: row.id, type: row.type, props: props ?? {}, style, name, groupId: groupId ?? null, locked: !!locked,
    x: Number(row.x), y: Number(row.y), width: Number(row.width), height: Number(row.height), rotation: Number(row.rotation) || 0, zIndex: row.z_index,
  } as SlideElement;
}

export function docFromRow(row: PresentationRow): PresentationDoc {
  const slides: Slide[] = [...(row.slides ?? [])]
    .sort((a, b) => a.order_index - b.order_index)
    .map((slide) => ({
      id: slide.id, title: slide.title, notes: slide.notes ?? "",
      background: { ...defaultBackground(), ...(slide.background ?? {}) },
      elements: (slide.slide_elements ?? []).map(elementFromRow).sort((a, b) => a.zIndex - b.zIndex),
    }));
  return { id: row.id, title: row.title, slides };
}

/** Shape expected by the save_presentation() SQL function. */
export function savePayload(doc: PresentationDoc) {
  return doc.slides.map((slide) => ({
    id: slide.id, title: slide.title, notes: slide.notes, type: slideType(slide), background: slide.background,
    elements: slide.elements.map((element) => {
      const interaction = interactionOf(element);
      return {
        id: element.id, type: element.type, x: element.x, y: element.y, width: element.width, height: element.height, rotation: element.rotation, z_index: element.zIndex,
        properties: { props: element.props, style: element.style, name: element.name, groupId: element.groupId ?? null, locked: !!element.locked },
        interaction: interaction && { type: interaction.kind, title: interactionTitle(interaction).slice(0, 500) || "Untitled", config: interaction.config, required: "required" in interaction.config ? !!interaction.config.required : false },
      };
    }),
  }));
}

/** Gives every slide and element fresh ids (duplicating decks, instantiating templates). Group ids are remapped consistently. */
export function withFreshIds(doc: Omit<PresentationDoc, "id">, id: string): PresentationDoc {
  const groups = new Map<string, string>();
  const group = (value?: string | null) => { if (!value) return null; if (!groups.has(value)) groups.set(value, crypto.randomUUID()); return groups.get(value)!; };
  return {
    id, title: doc.title,
    slides: doc.slides.map((slide) => ({ ...slide, id: crypto.randomUUID(), elements: slide.elements.map((element) => ({ ...element, id: crypto.randomUUID(), groupId: group(element.groupId) })) })),
  };
}
