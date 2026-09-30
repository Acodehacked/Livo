"use client";
import { useState } from "react";
import { fillCss } from "@/components/slide/render";
import { SubmitButton } from "@/components/loading";
import { TEMPLATES } from "@/lib/templates";
import { createPresentation } from "./actions";

export function NewPresentationForm() {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState("");
  if (!open) return <button className="button-primary big" onClick={() => setOpen(true)}>+ New presentation</button>;
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="new-deck-title" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <form action={createPresentation} className="dialog dialog-wide">
        <h2 id="new-deck-title">New presentation</h2>
        <label className="field field-wide"><span>Title</span><input name="title" autoFocus maxLength={120} placeholder={TEMPLATES.find((item) => item.id === template)?.name ?? "Untitled presentation"} /></label>
        <input type="hidden" name="template" value={template} />
        <p className="field-caption">Start from</p>
        <div className="template-grid">
          <button type="button" className={`template${template === "" ? " is-selected" : ""}`} onClick={() => setTemplate("")}>
            <span className="template-preview blank">+</span><b>Blank</b><small>Start from scratch</small>
          </button>
          {TEMPLATES.map((item) => (
            <button key={item.id} type="button" className={`template${template === item.id ? " is-selected" : ""}`} onClick={() => setTemplate(item.id)}>
              <span className="template-preview" style={{ background: fillCss(item.preview) }}>{item.name}</span><b>{item.name}</b><small>{item.description}</small>
            </button>
          ))}
        </div>
        <div className="row-actions">
          <button type="button" className="button-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <SubmitButton className="button-primary" pendingLabel="Creating…">Create</SubmitButton>
        </div>
      </form>
    </div>
  );
}
