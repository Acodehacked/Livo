"use client";
import Link from "next/link";
import { useState } from "react";
import { startSessionForm } from "@/app/rooms/actions";
import { deletePresentation, duplicatePresentation, renamePresentation } from "./actions";

export function PresentationActions({ id, title }: { id: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (editing) return <form action={renamePresentation} className="deck-edit" onSubmit={() => setEditing(false)}><input type="hidden" name="id" value={id} /><input name="title" defaultValue={title} autoFocus maxLength={120} /><button className="button-primary">Save</button><button type="button" className="button-secondary" onClick={() => setEditing(false)}>Cancel</button></form>;
  return (
    <div className="deck-actions">
      <form action={startSessionForm}><input type="hidden" name="presentationId" value={id} /><button className="button-primary small">▶ Present</button></form>
      <Link href={`/presentation/${id}`} className="text-button">Edit</Link>
      <Link href={`/presentation/${id}/analytics`} className="text-button">Analytics</Link>
      <button type="button" className="text-button" onClick={() => setEditing(true)}>Rename</button>
      <form action={duplicatePresentation}><input type="hidden" name="id" value={id} /><button className="text-button">Duplicate</button></form>
      {confirming
        ? <form action={deletePresentation} className="confirm-inline"><input type="hidden" name="id" value={id} /><button className="text-button danger">Delete “{title.slice(0, 24)}”?</button><button type="button" className="text-button" onClick={() => setConfirming(false)}>Keep</button></form>
        : <button type="button" className="text-button danger" onClick={() => setConfirming(true)}>Delete</button>}
    </div>
  );
}
