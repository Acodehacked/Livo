"use client";
import Link from "next/link";
import { useState } from "react";
import { startSessionForm } from "@/app/rooms/actions";
import { SubmitButton } from "@/components/loading";
import { deletePresentation, duplicatePresentation, renamePresentation } from "./actions";

export function PresentationActions({ id, title }: { id: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (editing) return <form action={async (formData) => { await renamePresentation(formData); setEditing(false); }} className="deck-edit"><input type="hidden" name="id" value={id} /><input name="title" defaultValue={title} autoFocus maxLength={120} /><SubmitButton className="button-primary" pendingLabel="Saving…">Save</SubmitButton><button type="button" className="button-secondary" onClick={() => setEditing(false)}>Cancel</button></form>;
  return (
    <div className="deck-actions">
      <form action={startSessionForm}><input type="hidden" name="presentationId" value={id} /><SubmitButton className="button-primary small" pendingLabel="Starting…">▶ Present</SubmitButton></form>
      <Link href={`/presentation/${id}`} className="text-button">Edit</Link>
      <Link href={`/presentation/${id}/analytics`} className="text-button">Analytics</Link>
      <button type="button" className="text-button" onClick={() => setEditing(true)}>Rename</button>
      <form action={duplicatePresentation}><input type="hidden" name="id" value={id} /><SubmitButton className="text-button" pendingLabel="Duplicating…">Duplicate</SubmitButton></form>
      {confirming
        ? <form action={deletePresentation} className="confirm-inline"><input type="hidden" name="id" value={id} /><SubmitButton className="text-button danger" pendingLabel="Deleting…">Delete “{title.slice(0, 24)}”?</SubmitButton><button type="button" className="text-button" onClick={() => setConfirming(false)}>Keep</button></form>
        : <button type="button" className="text-button danger" onClick={() => setConfirming(true)}>Delete</button>}
    </div>
  );
}
