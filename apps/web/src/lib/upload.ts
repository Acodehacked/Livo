"use client";

import { IMAGE_TYPES_LABEL, isImageType, MAX_IMAGE_BYTES } from "./image-types";

export { IMAGE_TYPES } from "./image-types";

/** Uploads straight from the browser to R2 using a signed URL; returns the public URL. */
export async function uploadImage(presentationId: string, file: File): Promise<string> {
  if (!isImageType(file.type)) throw new Error(`Use a ${IMAGE_TYPES_LABEL} image.`);
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`Images must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller.`);
  const response = await fetch("/api/assets/upload-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentationId, fileName: file.name, contentType: file.type, size: file.size }) });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Upload isn't available right now.");
  const { uploadUrl, publicUrl } = (await response.json()) as { uploadUrl: string; publicUrl: string };
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
  if (!put.ok) throw new Error("The upload failed. Check the R2 bucket's CORS settings.");
  return publicUrl;
}
